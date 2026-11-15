#!/usr/bin/env python3
"""Daily job robot (stdlib only).

What it does (and nothing else):
  1. For companies listed in data.json -> autoRefreshBoards, reads the company's
     public job board (Greenhouse or Ashby) and keeps ONE specific, open posting
     per company: title, location, apply link, posted base pay.
  2. Keeps the current posting while it is still open (no daily flip-flopping).
     Switches only when it closes, then says so in the changelog.
  3. Counts new matching openings since yesterday.
  4. For companies without a public board, checks the careers link still loads.
  5. Writes a short, dated changelog entry to updates.json (only if something changed).

It never touches: interview style tags, comp estimates, schools, or the prep roadmap.
"""
import html
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data.json"
UPDATES = ROOT / "updates.json"
UA = {"User-Agent": "Mozilla/5.0 (job-tracker-bot; personal use)"}
CHI = ZoneInfo("America/Chicago")
KEEP_ENTRIES = 20
MAX_CANDIDATES_FOR_PAY = 6

TITLE_OK = re.compile(
    r"software (engineer|developer)|back-?end|full[- ]?stack|member of technical staff|\bswe\b",
    re.I,
)
TITLE_BAD = re.compile(
    r"intern|new grad|university|apprentice|manager|director|head of|\bstaff\b|principal|"
    r"distinguished|fellow|architect|machine learning|\bml\b|\bai research|research|data scien|"
    r"security|\bsre\b|reliab|embedded|firmware|hardware|robotics|ios\b|android|mobile|"
    r"front-?end|support|sales|solutions|\bqa\b|test|model |inference|\bgpu\b|kernel|"
    r"engineering manager|recruit",
    re.I,
)
LOC_REMOTE_US = re.compile(
    r"remote.{0,12}(usa|u\.s\.|united states|\bus\b)|us-remote|usa.{0,6}remote|"
    r"remote[- ]first|^remote$|remote.?friendly|remote \(us\)|remote, us",
    re.I,
)
LOC_CHICAGO = re.compile(r"chicago", re.I)
LOC_US = re.compile(
    r"united states|\busa\b|\bus\b|u\.s\.|remote - us|chicago|new york|\bnyc\b|san francisco|"
    r"sunnyvale|menlo park|seattle|boston|bay area|, ca\b|, ny\b|, il\b|, wa\b|, tx\b|, ma\b",
    re.I,
)
LOC_NON_US = re.compile(
    r"canada|brazil|india|\buk\b|united kingdom|poland|germany|berlin|ireland|spain|france|"
    r"netherlands|singapore|australia|japan|mexico|argentina|colombia|emea|apac|latam|"
    r"israel|toronto|london|dublin",
    re.I,
)
PAY_RE = re.compile(
    r"\$\s?([\d,]{5,})(?:\.\d+)?\s*(?:/\s*year|per year|a year|annually|usd)?\s*"
    r"(?:-|–|—|to|and)\s*\$?\s?([\d,]{5,})",
    re.I,
)


# ---------- http ----------
def http_json(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def link_status(url):
    """Return HTTP status (int) or None if unreachable. Only 404/410 count as dead."""
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


# ---------- adapters: return list of postings ----------
def fmt_k(n):
    return f"${round(n / 1000):d}K"


def pay_label(lo, hi):
    if not lo and not hi:
        return None
    if lo == hi:
        return fmt_k(lo)
    return f"{fmt_k(lo)}–{fmt_k(hi)}"


def greenhouse_list(board):
    jobs = http_json(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs")["jobs"]
    return [
        {
            "id": str(j["id"]),
            "title": j["title"].strip(),
            "locations": [j["location"]["name"]],
            "url": j["absolute_url"],
            "ats": "greenhouse",
            "board": board,
        }
        for j in jobs
    ]


def greenhouse_pay(post):
    """Fill payMin/payMax from pay transparency, else from posting text. Best effort."""
    try:
        d = http_json(
            f"https://boards-api.greenhouse.io/v1/boards/{post['board']}/jobs/{post['id']}"
            "?pay_transparency=true"
        )
    except Exception:
        return
    ranges = d.get("pay_input_ranges") or []
    if ranges:
        post["payMin"] = round(min(r["min_cents"] for r in ranges) / 100)
        post["payMax"] = round(max(r["max_cents"] for r in ranges) / 100)
        return
    text = html.unescape(re.sub(r"<[^>]+>", " ", d.get("content") or ""))
    m = PAY_RE.search(text)
    if m:
        post["payMin"] = int(m.group(1).replace(",", ""))
        post["payMax"] = int(m.group(2).replace(",", ""))


def ashby_list(board):
    d = http_json(
        f"https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true"
    )
    out = []
    for j in d.get("jobs", []):
        if j.get("isListed") is False:
            continue
        locs = [j.get("location") or ""] + [
            s.get("location", "") for s in j.get("secondaryLocations", []) or []
        ]
        post = {
            "id": str(j["id"]),
            "title": (j.get("title") or "").strip(),
            "locations": [l for l in locs if l],
            "url": j.get("jobUrl"),
            "ats": "ashby",
            "board": board,
            "workplace": j.get("workplaceType"),
        }
        for c in (j.get("compensation") or {}).get("summaryComponents", []) or []:
            if c.get("compensationType") == "Salary" and c.get("minValue"):
                post["payMin"] = int(c["minValue"])
                post["payMax"] = int(c["maxValue"] or c["minValue"])
        out.append(post)
    return out


# ---------- selection ----------
def loc_tier(post):
    """1 = remote US, 2 = Chicago, 3 = elsewhere in the US, None = not usable."""
    locs = post["locations"]
    joined = " | ".join(locs)
    if any(LOC_REMOTE_US.search(l) and not LOC_NON_US.search(l) for l in locs):
        return 1
    if LOC_CHICAGO.search(joined):
        return 2
    usable = [l for l in locs if LOC_US.search(l) and not LOC_NON_US.search(l)]
    return 3 if usable else None


def passes(post, cfg):
    t = post["title"]
    if not TITLE_OK.search(t) or TITLE_BAD.search(t):
        return False
    extra_bad = cfg.get("titleExclude")
    if extra_bad and re.search(extra_bad, t, re.I):
        return False
    must = cfg.get("titleInclude")
    if must and not re.search(must, t, re.I):
        return False
    return loc_tier(post) is not None


def pre_score(post):
    tier = loc_tier(post)
    s = {1: 40, 2: 25, 3: 10}[tier]
    t = post["title"]
    if re.search(r"senior|\bsr\b|\biii\b|\bii\b", t, re.I):
        s += 8
    if re.search(r"software engineer i\b|junior|associate", t, re.I):
        s -= 8
    if re.search(r"all teams|general|core|platform|api", t, re.I):
        s += 3
    return s


def final_score(post):
    s = pre_score(post)
    if post.get("payMax") and post["payMax"] >= 200_000:
        s += 10
    if post.get("payMin") and post["payMin"] >= 200_000:
        s += 6
    return s


def pretty_loc(l):
    l = l.strip()
    m = re.match(r"US-([A-Z]{2})-(.+)", l)
    if m:
        l = f"{m.group(2).strip()}, {m.group(1)}"
    l = re.sub(r",?\s*(USA|United States)\b", "", l, flags=re.I)
    l = re.sub(r"\s*\(HQ\)", "", l)
    l = re.sub(r"\s+\d{5}\b", "", l)
    return l.strip(" ,")


def us_locations(post):
    out = []
    for loc in post["locations"]:
        for part in re.split(r";|\|", loc):
            if part.strip() and LOC_US.search(part) and not LOC_NON_US.search(part):
                out.append(pretty_loc(part))
    return list(dict.fromkeys(out))


def place_label(post, tier):
    if tier == 1:
        return "Remote (US)"
    if tier == 2:
        return "Chicago, IL"
    cities = [l.split(",")[0].strip() for l in us_locations(post)]
    return " · ".join(dict.fromkeys(cities[:3])) or "US"


def job_id_from_link(link):
    m = re.search(r"gh_jid=(\d+)|/jobs/(\d+)|/detail/(\d+)|/([0-9a-f-]{36})", link or "")
    if not m:
        return None
    return next(g for g in m.groups() if g)


def short_title(t):
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^Senior ", "Sr ", t)
    t = t.replace("Software Engineer", "SWE").replace("Software Developer", "SWE")
    return t[:48]


def apply_pick(job, post, tier):
    job["role"] = post["title"]
    job["location"] = place_label(post, tier)
    job["link"] = post["url"]
    job["rank"] = tier
    if tier == 1:
        job["workMode"] = "Remote"
    live = {
        "id": post["id"],
        "title": post["title"],
        "url": post["url"],
        "ats": post["ats"],
        "payMin": post.get("payMin"),
        "payMax": post.get("payMax"),
        "payLabel": pay_label(post.get("payMin"), post.get("payMax")),
        "checked": datetime.now(CHI).date().isoformat(),
    }
    job["live"] = live


# ---------- main ----------
def main():
    data = json.loads(DATA.read_text())
    boards = data.get("autoRefreshBoards", {})
    jobs_by_company = {j["company"]: j for j in data["jobs"]}
    watch = data.setdefault("watch", {})
    bullets = []
    errors = []

    for company, cfg in boards.items():
        job = jobs_by_company.get(company)
        if not job:
            continue
        try:
            pool_all = greenhouse_list(cfg["board"]) if cfg["ats"] == "greenhouse" else ashby_list(cfg["board"])
        except Exception as e:  # network / API hiccup: leave the card as-is
            errors.append(f"{company}: {type(e).__name__}")
            continue
        pool = [p for p in pool_all if passes(p, cfg)]
        by_id = {p["id"]: p for p in pool}
        prev_live = job.get("live") or {}
        prev_id = prev_live.get("id") or job_id_from_link(job.get("link"))
        prev_pay = prev_live.get("payLabel")
        prev_rank = job.get("rank", 3)

        # 1) keep current posting if still open
        keep = by_id.get(prev_id) if prev_id else None
        if not keep and prev_id and prev_id in {p["id"] for p in pool_all}:
            # still open but now filtered out (e.g. title tweak) -> keep it anyway
            keep = next(p for p in pool_all if p["id"] == prev_id)
            keep.setdefault("locations", ["United States"])
        if keep:
            chosen = keep
            if cfg["ats"] == "greenhouse":
                greenhouse_pay(chosen)
            tier = loc_tier(chosen) or prev_rank
        else:
            if not pool:
                errors.append(f"{company}: no matching open roles")
                continue
            ranked = sorted(pool, key=pre_score, reverse=True)
            if cfg["ats"] == "greenhouse":
                ranked = ranked[:MAX_CANDIDATES_FOR_PAY]
                for p in ranked:
                    greenhouse_pay(p)
            chosen = max(ranked, key=final_score)
            tier = loc_tier(chosen)
            if prev_id:
                bullets.append(
                    {
                        "k": "link",
                        "text": f"{company}: posting closed → {short_title(chosen['title'])}, {place_label(chosen, tier)}",
                    }
                )
        apply_pick(job, chosen, tier)

        new_pay = job["live"]["payLabel"]
        if keep and new_pay and prev_pay and new_pay != prev_pay:
            bullets.append({"k": "pay", "text": f"{company}: base pay {prev_pay} → {new_pay}"})

        # 2) new openings at least as convenient as the current card
        ids = sorted(p["id"] for p in pool if (loc_tier(p) or 3) <= job["rank"])
        seen = watch.get(company)
        if seen is not None:
            new = [p for p in pool if p["id"] not in set(seen) and (loc_tier(p) or 3) <= job["rank"]]
            if new:
                best = max(new, key=pre_score)
                n = len(new)
                label = short_title(best["title"])
                bullets.append(
                    {
                        "k": "new",
                        "text": f"{company}: +{n} new role{'s' if n > 1 else ''} (e.g. {label})",
                    }
                )
        watch[company] = ids

    # 3) link health for companies without a public board
    for job in data["jobs"]:
        if job["company"] in boards:
            continue
        st = link_status(job["link"])
        was_dead = job.get("linkDead")
        if st in (404, 410):
            if not was_dead:
                bullets.append({"k": "dead", "text": f"{job['company']}: careers link broke"})
            job["linkDead"] = True
        elif st is not None and was_dead:
            job.pop("linkDead", None)
            bullets.append({"k": "link", "text": f"{job['company']}: careers link works again"})

    # 4) sort by tier then company so the page order is stable
    data["jobs"].sort(key=lambda j: (j.get("rank", 3), j["company"]))

    now = datetime.now(timezone.utc)
    data["lastUpdated"] = now.isoformat()
    data["checkedAt"] = now.isoformat()
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    if bullets:
        entry = {
            "id": now.strftime("%Y-%m-%dT%H:%MZ"),
            "date": now.astimezone(CHI).date().isoformat(),
            "source": "robot",
            "bullets": bullets[:8],
        }
        write_entry(entry)
    print(f"bullets={len(bullets)} errors={errors}")
    for b in bullets:
        print(" -", b["text"])
    return 0


def write_entry(entry):
    try:
        cur = json.loads(UPDATES.read_text())
    except Exception:
        cur = {}
    entries = cur.get("entries", [])
    entries = [entry] + [e for e in entries if e.get("id") != entry["id"]]
    UPDATES.write_text(
        json.dumps({"entries": entries[:KEEP_ENTRIES]}, indent=2, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    sys.exit(main())
