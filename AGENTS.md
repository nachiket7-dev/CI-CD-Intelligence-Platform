# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor, OpenCode and others) working in this repo. Humans: start with README.md.

## What this is
A CI/CD intelligence platform. A seeded simulator produces CI runs, a model trained only on information known before a run finishes scores its failure risk, a promotion gate decides whether a model may serve, and a dashboard shows scores, reasons and how they compared with reality. **All data is synthetic.**

## Layout
- `backend/` FastAPI, SQLAlchemy, scikit-learn. `app/contract.py` is the feature contract. `app/ml/` is the pipeline, `app/simulator/` is the simulator, `app/api/` the routes.
- `frontend/` React 18, Vite, TypeScript, Tailwind v4. `src/components/ui` primitives, `src/components/domain` product components, `src/pages` screens, `src/lib` API client, hooks and formatters.
- `DESIGN.md` the locked design system. `docs/UI_BRIEFS.md` ready-made prompts for UI work.

## Commands
```bash
# backend (from backend/)
pip install -r requirements.txt
python -m pytest               # 39 tests, about 15 s
python -m app.cli demo         # fill the local DB: simulate, train, promote, add live runs
python -m app.cli sweep        # baseline vs candidate over several seeds
uvicorn app.main:app --reload  # API on :8000, docs at /docs
ruff check app tests && ruff format app tests

# frontend (from frontend/)
npm install
npm run dev                    # :5173, proxies /api to :8000
npm run dev:mock               # no backend needed; sample data in memory
npm run typecheck && npm test && npm run build
npm run slop                   # Hallmark design lint (run `bash ../scripts/setup-hallmark.sh --local` once)
```

## UI work: read this first
1. Read `DESIGN.md`. It is locked. Do not restyle, re-theme or add a second accent. Amber is a person's action, cool blue is what the model measured, green and red are outcomes.
2. Open `/design` (dev only) and reuse what is there. Add a new component to that page, in every state, before using it on a screen.
3. Colour, type, radius and spacing come from tokens (`bg-paper-2`, `text-muted`, `rounded-card`). Never write a colour literal, a font-family or `transition: all`.
4. Every region that loads data goes through `DataState` so loading, empty, error and full are all drawn.
5. Put filters, tabs and pagination in the URL with `useUrlState`.
6. Numbers are tabular and in the measured face: `className="num font-outlier"`. Labels are sentence case, never capitals, no eyebrows, no middle-dot meta strings.
7. Controls: 36px high, 44px on touch, one primary per screen, an explicit `type` on every button, a label on every field.
8. Use `npm run dev:mock` to build UI without the backend. Extend `src/lib/mocks.ts` when you add an endpoint.
9. Finish with `npm run typecheck && npm test && npm run slop`. Fix every FAIL and REFLEX.
10. If Hallmark is installed, a screen is an "app screen": no hero, no marketing sections. See `docs/UI_BRIEFS.md`.

## Backend work: the rules that must not break
- **No leakage.** Only information known when a run starts may become a feature. Add a feature to `contract.py` first (with its definition), then to `ml/features.py`. The builder reads only `PRE_RUN_COLUMNS` of the run it scores, and rolling features may use only runs that had already finished. `tests/test_leakage.py` enforces this; never weaken it.
- Outcomes live in their own table. A prediction is stored before its outcome exists and is never edited afterwards.
- Training is time-ordered (`ml/split.py`). Never shuffle.
- A candidate is promoted only through the gate (`ml/gate.py`). Tests must show a weak model being rejected.
- Same seed gives the same dataset and the same report. Keep it that way.
- Keep API response shapes in sync with `frontend/src/lib/types.ts` and the mocks.

## Definition of done
Backend: tests and ruff pass, a test covers the behaviour, the contract still holds.
Frontend: typecheck, tests, build and `npm run slop` pass, the screen has all four data states, it works at 375px wide and with keyboard only, and it is shown on `/design` if it is a new component.
