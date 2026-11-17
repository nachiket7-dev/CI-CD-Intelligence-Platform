# UI briefs for coding tools

Ready-to-paste prompts for Claude Code, Codex, Cursor, OpenCode or any agent that reads `AGENTS.md`. Each one names the files to touch, the constraints that keep the UI consistent, and how to know it is done. Paste one, then add anything specific you want.

## One-time setup

```bash
bash scripts/setup-hallmark.sh           # installs the Hallmark design skill for your agents
bash scripts/setup-hallmark.sh --local   # or: clone it into .hallmark-skill for `npm run slop`
cd frontend && npm install && npm run dev:mock
```

Open `http://localhost:5173/design` to see every component in every state. That page is the reference for the look.

## How to brief an agent well

Use this skeleton for anything not covered below.

```text
Read AGENTS.md and DESIGN.md first. This is an app screen in the locked Console system.

Goal: <what the person using it can do now, in one sentence>
Screen or component: <path, or "new">
Data: <endpoint(s), or "use mocks and extend src/lib/mocks.ts">
States to draw: loading, empty, error, full (via DataState)
Constraints: tokens only, no new colours, no new dependencies, state in the URL, numbers in `num font-outlier`
Done when: npm run typecheck, npm test and npm run slop pass; it works at 375px and by keyboard; new components appear on /design
```

## Briefs

### 1. Restack the tables on phones
```text
Read AGENTS.md and DESIGN.md. Tables in src/components/ui/Table.tsx currently scroll sideways under 40rem.
Make the Runs table restack each row into a labelled block on narrow screens, keeping the run link and
the risk reading visible without scrolling. Keep the real <table> semantics on wide screens. Add a
Table example to /design at both widths. Done when it reads well at 375px and slop passes.
```

### 2. A light colourway
```text
Read DESIGN.md. Add the Console "paper" colourway (light ground) as an alternative to graphite.
Hallmark's Console theme defines the values: ground oklch(98% 0.006 85), ink oklch(19% 0.010 60),
amber oklch(54% 0.14 70), cool oklch(52% 0.14 250). Re-derive ok, bad and the soft tints for contrast.
Switch with prefers-color-scheme and a toggle in the top bar, stored in localStorage. Change tokens
only: no component may gain a colour literal. Add both colourways side by side on /design.
Done when every text and chip pair passes WCAG AA in both.
```

### 3. Scenario editor
```text
Add a "Scenarios" screen where a person tunes how the simulator behaves and regenerates data.
Backend: GET /api/scenarios/{name} returns the full scenario JSON; POST /api/simulate already accepts
a scenario list, so add an optional per-scenario "overrides" object validated by Pydantic. Frontend: a
new route /scenarios with a table of scenarios, and an inline editor (no modal) for base failure rate,
dependency effect, queue threshold and noise, each a labelled number field with helper text.
Show the effect on the next dataset after "Generate dataset". Keep state in the URL (selected scenario).
Add backend tests for validation. Done when the four data states are drawn and the contract tests still pass.
```

### 4. Risk over time on the tracker
```text
Add a rolling view to /tracker: the Brier score and the share of high-risk runs that failed, by
batch of 20 scored runs. Backend: extend GET /api/tracker with a `batches` array. Frontend: a small
multiples pair of LineChart components (never a dual axis), each a single cool series, with a table
fallback beneath for screen readers. Empty state under 40 scored runs says how many more are needed
and links to the pending runs. Done when the new chart and its empty state are on /design.
```

### 5. Run detail: similar runs
```text
On /runs/:id add a panel "Similar runs that finished": up to 8 earlier runs in the same repository
and workflow with a similar change size, shown as a table with outcome and duration. Backend: a new
GET /api/runs/{id}/similar. It must only return runs that finished before this run started, so it can
never show hindsight. Add a test for that. Frontend: a Panel with a table and the four data states.
```

### 6. Keyboard and screen reader pass
```text
Audit every page for keyboard-only use and screen readers. Check focus order, visible focus on every
interactive element, button and link names, table captions, live regions for loading and errors, and
colour contrast of text on each surface. Fix what fails with token and markup changes only. Report
what you changed as a list of file and one-line reason. Done when slop and tests pass.
```

### 7. Visual QA loop
```text
Install puppeteer-core and Chrome, run `npm run dev:mock`, then run `npm run slop -- --render`.
Open each route at 1280 and 375 pixels wide, look at the screenshots, and list anything that reads as
generated, cramped or inconsistent with DESIGN.md. Fix the three most important, rerun, and show before
and after. Do not change tokens.
```

### 8. Compare two models
```text
Add /models/compare?a=<id>&b=<id>: two models side by side with the metrics table, both precision and
recall curves on one LineChart (one loud series, one neutral), and a gate summary for each. Pick the two
from selects in the page header, with the ids in the URL. Backend needs no change (use /api/reports/{id}).
```

## When something looks off

- If an agent invents a colour, a font or a card style: point it at `DESIGN.md` and `/design` and ask it to redo the change with tokens only.
- If it adds a modal, hero, gradient or icon tile: this is an app screen. Ask for inline editing or disclosure instead.
- If a number looks made up: it must come from the API, or be marked sample data in `mocks.ts`.
