# Project conventions

## Housekeeping after tasks
- Clean up scratch files you created once the task is done, unless the result is committed to the repo.
- Large tool downloads go to `C:\Temp\opencode` and must be deleted after the task (e.g. tool zips/installers). Leave the small reusable scripts.
- `C:\Temp\opencode` is shared with other opencode sessions. Never delete files that were modified during the current inspection — another session may be actively using them. Only remove files you can positively identify as yours and stale.
- Server projects (`nat-punch-test`): after testing, delete stale runtime artifacts — `*.log`, `*.pid` (already gitignored). No `node` process should be left running.
- Keep `github-stats/stats.json` — it is a tracked project asset, not scratch.
- Public websites in this repo are served via GitHub Pages; `.nojekyll` must stay.

## Commands
- No test/lint/build framework — plain static HTML/JS. Verify by opening the file or `python -m http.server` if needed.