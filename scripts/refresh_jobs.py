#!/usr/bin/env python3
"""
Daily refresh for the job tracker.

What this robot is allowed to change (and what the banner reports):
  - Greenhouse boards in autoRefreshBoards: swap the Apply link to a live
    SWE posting in that company's location bucket (remote / Chicago / SF-NYC).
  - Every job: flag a clearly dead apply link (HTTP 404/410).

What it never changes: interview `style`, comp, rank, schools, prep roadmap.

Banner (updates.json) is written only when something above actually changed.
Date + bullets. Acknowledge in the UI hides it until the next real change.

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

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data.json"
UPDATES_PATH = ROOT / "updates.json"

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

UA = "job-tracker-bot (+https://github.com/onemokang/job-application-tracker)"


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

    def score(c):
        title = c[0]
        s = 0
        if re.match(r"senior", title, re.I):
            s += 2
        if re.search(r"\bsoftware engineer\b", title, re.I):
            s += 1
        if "(all teams)" in title.lower():
            s += 1
        return -s

    candidates.sort(key=score)
    title, loc, url = candidates[0]
    return {"role": title, "location": loc, "link": url}


def link_is_reachable(url: str) -> bool:
    """Only a clear 404/410 counts as dead. 403/429 are treated as still up."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
        urllib.request.urlopen(req, timeout=15)
        return True
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return False
        return True
    except Exception:
        return True


def write_update(bullets: list[str]) -> None:
    if not bullets:
        return
    now = datetime.now(timezone.utc)
    payload = {
        "id": now.strftime("%Y-%m-%dT%H:%MZ"),
        "date": f"{now:%b} {now.day}, {now:%Y}",
        "source": "daily-refresh",
        "bullets": bullets,
    }
    UPDATES_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print("[update-banner]", payload["id"], bullets)


def main():
    data = json.loads(DATA_PATH.read_text())
    jobs = data["jobs"]
    boards = data.get("autoRefreshBoards", {})
    changed = False
    bullets: list[str] = []

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
                print(f"[update] {company}: link -> {match['link']} ({match['role']!r})")
                job["link"] = match["link"]
                job["postingTitle"] = match["role"]
                changed = True
                bullets.append(f"Jobs: {company} apply link refreshed → {match['role']}")
            elif match:
                job["postingTitle"] = match["role"]
            else:
                print(f"[warn] {company}: no current match found on board, leaving as-is")

        if not link_is_reachable(job["link"]):
            print(f"[warn] {company}: link looks dead ({job['link']})")
            bullets.append(f"Jobs: {company} apply link looks dead")

    data["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    write_update(bullets)
    print("changed:", changed)


if __name__ == "__main__":
    main()
