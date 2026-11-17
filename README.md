# CI/CD Intelligence Platform

Estimate how likely a CI run is to fail **before it finishes**, and show why.

A seeded simulator produces CI runs. A model trained only on information known when a run starts scores its failure risk. A promotion gate decides whether a model may serve. A dashboard shows each score, the signals behind it, and later how it compared with what happened.

> **Synthetic data.** Everything here comes from a simulator. Results show that the pipeline works, not that it generalises to real repositories. The UI says so on every screen.

Free tools only and local-first: Python, SQLite, scikit-learn, React.

## Quick start

You need Python 3.11+ and Node 22+.

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.cli demo            # simulate 4,000 runs, train, promote, add scored live runs
uvicorn app.main:app --reload     # API on http://localhost:8000 (docs at /docs)

# 2. Frontend, in a second terminal
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

No backend yet? `npm run dev:mock` runs the whole UI on in-memory sample data.

Try it: open **Runs**, filter to Running, open a run, choose **Score this run**, then **Finish run**. Open **Tracker** to see the prediction beside the outcome. Open **Models**, train the "deliberately weak" candidate, and watch the gate reject it.

## How it works

| Step | What happens | Where |
|---|---|---|
| Simulate | Four scenarios (stable, risky dependencies, flaky workflows, busy queue) produce runs with a hidden outcome. Same seed, same data. | `backend/app/simulator`, `backend/scenarios/*.json` |
| Contract | A written list of allowed pre-run features, and of forbidden post-run fields. | `backend/app/contract.py` |
| Features | Pre-run fields plus rolling rates from runs that had already finished. | `backend/app/ml/features.py` |
| Split | Time-ordered train, validation and test. Never shuffled. | `backend/app/ml/split.py` |
| Train and compare | Majority-class and logistic regression baselines against a candidate (gradient boosting by default), with calibration. | `backend/app/ml/pipeline.py` |
| Gate | The candidate must beat the best baseline on PR-AUC by a margin, with no worse calibration and a clean contract. | `backend/app/ml/gate.py` |
| Serve and record | Score a pending run before it finishes, record the real outcome later, never edit the score. | `backend/app/services_models.py` |
| Explain | Per-run signals by occlusion: what the risk would be if a feature had its typical value. | `backend/app/ml/explain.py` |

## Commands

| Task | Command |
|---|---|
| Backend tests (39) | `cd backend && python -m pytest` |
| Baseline vs candidate over seeds | `python -m app.cli sweep --seeds 5` |
| Lint and format | `ruff check app tests && ruff format app tests` |
| Frontend checks | `cd frontend && npm run typecheck && npm test && npm run build` |
| Design lint (Hallmark) | `bash scripts/setup-hallmark.sh --local && cd frontend && npm run slop` |

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/simulate` | Replace runs with a fresh simulated dataset |
| `POST /api/simulate/live` | Add pending runs, scored on arrival if a model is active |
| `GET /api/runs`, `GET /api/runs/{id}` | List and read runs, with risk, signals and trail |
| `POST /api/runs/{id}/predict` | Score a pending run (finished runs are refused) |
| `POST /api/runs/{id}/finish` | Demo helper: reveal the simulated result and record it |
| `POST /api/runs/{id}/outcome` | Record a real outcome |
| `POST /api/predict` | Score an ad hoc run from pre-run fields. Post-run fields get a 422 |
| `POST /api/models/train` | Train baselines and a candidate, then run the gate |
| `POST /api/models/{id}/promote` | Make a gate-passing candidate the active model |
| `GET /api/reports/latest` | Evaluation report: metrics, curves, thresholds, importances |
| `GET /api/tracker` | Prediction against reality |

## Building the UI further with other coding tools

The UI follows [Hallmark](https://github.com/Nutlope/hallmark), a design skill for AI coding assistants. This repo is set up so any agent produces screens that match:

- `DESIGN.md` is the locked design system (the Console theme, graphite). Agents defer to it.
- `AGENTS.md` and `CLAUDE.md` are the rules and commands agents read automatically.
- `/design` is a living style guide of every component in every state (development only).
- `npm run dev:mock` lets you build UI with no backend running.
- `npm run slop` runs Hallmark's design linter and fails on generic, generated-looking patterns.
- `docs/UI_BRIEFS.md` has ready-to-paste prompts for common next steps.

## Layout

```text
backend/    FastAPI, SQLAlchemy, scikit-learn. Tests in backend/tests.
frontend/   React 18, Vite, TypeScript, Tailwind v4.
docs/       UI briefs for coding tools.
scripts/    Hallmark setup and the design-lint runner.
DESIGN.md   Locked design system.      AGENTS.md   Rules for coding agents.
```

## Honest limits and next steps

- The simulator is a noisy logistic model with a few interactions, so logistic regression is a strong baseline and the gate rejects some candidates. That is the gate working. Run `python -m app.cli sweep` to see the pass rate over seeds.
- Database tables are created on start. Add Alembic migrations before the schema changes.
- Not built yet: a real-data check on a public GitHub Actions dataset (report separately), drift reports, MLflow or Docker (optional extras), authentication.
- Top signals describe the model, not proven causes of a failure.
# CI-CD-Intelligence-Platform
