#!/usr/bin/env python3
"""
Daily refresh for the job tracker.

For every company in data.json's `autoRefreshBoards` (companies hosted on
Greenhouse), pull the live public Job Board API and point that company's
`link`/`role`/`location` at a currently-open posting matching:
  - title looks like a software engineering role
  - location matches that company's target bucket (remote / Chicago / SF-NYC)

This keeps those 4 links from ever going stale/404, without needing any
auth or scraping — Greenhouse's board API is public.

NOTE on the `style` field (ai / leetcode / mixed / unclear): this script
never touches it. Interview style requires reading real candidate reports
(Glassdoor/Blind/Reddit/company blogs), which isn't something a link-check
script can verify. When a new company is added, set its `style` by hand
after research, and record a short `styleNote` with your source/reasoning.

Run by .github/workflows/refresh-jobs.yml on a daily cron.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data.json"

TITLE_INCLUDE = re.compile(
    r"software engineer|swe\b|backend engineer|full[- ]stack engineer|platform engineer",
    re.I,
)
TITLE_EXCLUDE = re.compile(
    r"manager|director|intern|recruiter|sales|staffing|robotic|autonomy|firmware|embedded",
    re.I,
)
LOCATION_PATTERNS = {
    1: re.compile(r"remote", re.I),
    2: re.compile(r"chicago", re.I),
    3: re.compile(r"san francisco|new york|sunnyvale|nyc", re.I),
}

UA = "job-application-tracker-refresh-bot (+https://github.com/onemokang/job-application-tracker)"


def fetch_board(board_token: str) -> list[dict]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.load(resp)
    return data.get("jobs", [])


def best_match(jobs: list[dict], rank: int) -> dict | None:
    loc_pat = LOCATION_PATTERNS[rank]
    candidates = []
    for j in jobs:
        title = j.get("title", "")
        loc = (j.get("location") or {}).get("name", "")
        if not TITLE_INCLUDE.search(title):
            continue
        if TITLE_EXCLUDE.search(title):
            continue
        if not loc_pat.search(loc):
            continue
        candidates.append((title, loc, j.get("absolute_url")))

    if not candidates:
        return None

    # Prefer titles that start with "Senior" or contain a plain, generic
    # "Software Engineer" phrase over more niche variants — gives a more
    # representative link for this personal tracker's purposes.
    def score(c):
        title = c[0]
        s = 0
        if re.match(r"senior", title, re.I):
            s += 2
        if re.search(r"\bsoftware engineer\b", title, re.I):
            s += 1
        if "(all teams)" in title.lower():
            s += 1
        return -s  # lower is better for sort

    candidates.sort(key=score)
    title, loc, url = candidates[0]
    return {"role": title, "location": loc, "link": url}


def link_is_reachable(url: str) -> bool:
    """Best-effort HEAD/GET check. Many ATS sites block bots (403), which we
    don't treat as broken — only a clear 404/410 counts as dead."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
        urllib.request.urlopen(req, timeout=15)
        return True
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return False
        return True  # 403/429/etc — ambiguous, assume still fine
    except Exception:
        return True  # network hiccup — don't flag as dead on a fluke


def main():
    data = json.loads(DATA_PATH.read_text())
    jobs = data["jobs"]
    boards = data.get("autoRefreshBoards", {})
    changed = False

    for job in jobs:
        company = job["company"]
        board_cfg = boards.get(company)

        if board_cfg:
            try:
                board_jobs = fetch_board(board_cfg["board"])
                match = best_match(board_jobs, board_cfg["rank"])
            except Exception as e:
                print(f"[warn] could not refresh {company}: {e}", file=sys.stderr)
                match = None

            if match and match["link"] != job.get("link"):
                print(f"[update] {company}: link -> {match['link']} (live posting: {match['role']!r})")
                # Only the link + a transparency note change — curated role/
                # location/comp framing (which reflects the general target,
                # not one specific req) is left untouched so comp estimates
                # never silently drift to match whatever title the bot found.
                job["link"] = match["link"]
                job["postingTitle"] = match["role"]
                changed = True
            elif match:
                job["postingTitle"] = match["role"]
            elif not match:
                print(f"[warn] {company}: no current match found on board, leaving as-is")
        else:
            # Non-Greenhouse entries: best-effort dead-link check only.
            if not link_is_reachable(job["link"]):
                print(f"[warn] {company}: link looks dead ({job['link']})")

    data["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print("changed:", changed)


if __name__ == "__main__":
    main()
