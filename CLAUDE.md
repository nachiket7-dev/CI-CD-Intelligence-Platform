@AGENTS.md

## Claude Code notes
- Install the Hallmark design skill once with `bash scripts/setup-hallmark.sh`. When asked to build or change a screen, treat it as a Hallmark **app screen**. `DESIGN.md` at the repo root is a locked system, so Hallmark defers to it and does not deal a new theme.
- For a new screen, state the picks in one line before building: `Screen: <what it shows>, states: loading, empty, error, full`.
- To check your work visually, run `npm run dev:mock` and `npm run slop -- --render` (needs `puppeteer-core` and Chrome).
- Use the briefs in `docs/UI_BRIEFS.md` as the starting prompt for common UI tasks.
