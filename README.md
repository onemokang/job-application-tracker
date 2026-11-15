# Job Application Tracker

A personal job-search site. Static pages on GitHub Pages, no backend.

Live: https://onemokang.github.io/job-application-tracker/

## What it has

| Tab | What it shows |
|---|---|
| **Jobs** | One open role per company with apply link, posted pay, comp estimate, interview style. Grouped by Remote, Chicago, Relocate. Mark roles as applied. |
| **Grad school** | Online CS / data programs with exact deadlines, GRE rules and ranks. |
| **Prep map** | A 14-world map from Python basics to apply waves. Each step names the exact lesson, chapter or problem set, says how much to do, and links to its own notes file. Tick steps and problems as you go. |

Also: a "What changed" banner with dated notes, light and dark themes (each world has its own scenery), and a countdown to the apply date.

## Install as an app

- **iPhone:** open the site in Safari, Share (or the **...** menu) > Add to Home Screen > keep "Open as Web App" on.
- **Android / Chrome:** tap the "Install app" chip.

The installed app has its own storage. Unlock it and connect sync once there.

## How it stays up to date

- **Job robot** (`scripts/refresh_jobs.py`, run by `.github/workflows/refresh-jobs.yml` twice a day):
  - Reads public Greenhouse and Ashby boards for the companies in `data.json` > `autoRefreshBoards`.
  - Keeps one open posting per company until it closes, then switches and says so.
  - Checks the other careers links still load.
  - Writes a dated entry to `updates.json` only when something changed.
  - It never edits comp estimates, interview styles, schools or the roadmap.
- **Everything else** (comp, styles, schools, roadmap) is edited by hand and researched with a dated `researchDate` / `compResearchDate`.
- **Site changes** go into `updates.json` as `source: "site"` entries so the banner explains them.

## Sync across devices

Applied marks go to `status.json`. Prep progress goes to `progress.json`. Both are written through the GitHub Contents API.

1. Create a fine-grained GitHub token limited to this repo with **Contents: read and write**.
2. Tap the sync chip in the header and paste it.

The token is stored only in that browser's `localStorage`. It is never committed. Without a token you can still read everything and tick Prep map steps (saved on that device). Marking a job as applied asks for the token first.

If you edit on two devices at once, the last save wins.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css` | Page and styles |
| `app.js` | Tabs, jobs, schools, prep map, banner, install prompt |
| `scenery.js` | The 14 world themes and their moving objects |
| `sync.js`, `config.js` | GitHub sync (owner, repo, paths; no secrets) |
| `data.json` | Jobs, dropped roles, comp floor (robot updates links and pay) |
| `schools.json` | Programs and deadlines |
| `roadmap.json` | Prep zones and steps (`theme` picks the scenery) |
| `updates.json` | Banner entries |
| `status.json`, `progress.json` | Synced state |
| `manifest.json`, `sw.js`, `icons/` | Installable app. `sw.js` loads the live site first and falls back to cache offline. |

## Run locally

```
python3 -m http.server 8765
```

Open http://localhost:8765. To run the robot once: `python3 scripts/refresh_jobs.py` (Python 3.9+, no packages).

## When you change code

Bump the `?v=` number on the script and style tags in `index.html`. Without it, a phone or browser can run old JS against new data.

## Privacy

This repo is public, and so is everything in it, including the data files. The password screen is a convenience lock in the browser, not security. Do not commit resumes, notes, tokens or personal documents. Study notes live in a separate private repo.
