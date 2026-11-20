# CI/CD Intelligence Platform: Project Plan
 
Source of truth for what this project is meant to be. It condenses the "CI-CD Intelligence" tab of the planning workbook (Project_Plans_Mentor_Version.xlsx) so coding agents that cannot open the workbook can still follow it. Anything marked **proposed** is a design choice made while building, not something the workbook specified, and can be changed.
 
## Purpose
 
Estimate, **before a build finishes**, how likely it is to fail, and show why.
 
- Type: AI/ML project with an MLOps flavour.
- Free tools only, local-first.
- **Honest label:** all data is synthetic. Results show the pipeline works, not that it generalises to real repositories. This is stated in the UI, the README and any claim made about the project.
## Problem
 
Teams find out a build is broken only after CI has run, then spend time debugging, re-running flaky workflows and waiting in queues. Failures are the rare class, they arrive over time, and the information that could warn of them (size of the change, recent failure history of the workflow, which files were touched) is already known when the run starts.
 
## Solution
 
1. A **seeded CI simulator** produces runs: metadata known at start, plus a hidden outcome. (You cannot use someone else's real CI.)
2. A **feature contract** lists exactly which fields may be model inputs (pre-run only). A test enforces it.
3. A **time-ordered split** keeps the future out of training.
4. A **baseline** and a **candidate** model are compared on PR-AUC, recall at fixed precision and calibration.
5. A **promotion gate** activates the candidate only if it beats the baseline by a set margin.
6. A **prediction API** scores a run before it finishes. The **real outcome** is recorded later.
7. A **dashboard** shows the risk, the top signals, and prediction vs reality.
Honest limits: synthetic data; the system never skips tests automatically, it only informs a human; top signals describe the model and are not proven causes.
 
## Stack
 
| Layer | Main choice | Alternatives |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS v4 | shadcn/ui; Recharts or Chart.js |
| Backend | Python + FastAPI | Flask |
| Database | SQLite with SQLAlchemy and Alembic | PostgreSQL later; DuckDB for analysis |
| ML | scikit-learn: majority-class and Logistic Regression baselines; HistGradientBoosting or Random Forest candidate; pandas, joblib | XGBoost or LightGBM; CalibratedClassifierCV; permutation importance (SHAP optional) |
| Simulator | Python + numpy random Generator with scenario files | Faker; SimPy for queueing |
| Model tracking | SQLite registry table plus a local models folder | MLflow, DVC, Evidently |
| Testing and CI | pytest, Vitest, GitHub Actions | ruff + ESLint; Playwright later |
 
## How it works
 
| Step | What happens |
|---|---|
| 1. Simulate | Seeded simulator creates runs with metadata known at start and a hidden outcome |
| 2. Features | Only pre-run information becomes features (for example the recent failure rate of the workflow, size of the change). A written feature contract is tested |
| 3. Split | Time-ordered train, validation and test |
| 4. Train and compare | Baseline vs candidate: PR-AUC, precision and recall, calibration, threshold trade-offs |
| 5. Promotion gate | Candidate becomes active only if it beats the baseline by a set margin |
| 6. Serve and record | API scores a new run before it finishes; the real outcome is stored later |
 
## Success measures
 
Collect these before making any resume claim, and always state that the data is synthetic.
 
| Claim | What to measure | How |
|---|---|---|
| Beats the baseline | PR-AUC and recall at fixed precision on a time-split test set, over several seeds (mean and spread) | Script looping over seeds |
| No leakage | Feature-contract test passes; results with suspicious features removed | pytest plus a short ablation table |
| Calibrated | Brier score and reliability curve | scikit-learn calibration tools |
| Works on real data (optional) | A separate run on a public CI dataset, reported separately | Check the dataset's licence and fields |
 
## MVP scope
 
**In:** simulator with at least 3 scenarios, feature contract, baseline and candidate, time-split evaluation report, promotion gate, prediction API, dashboard with risk and top signals, outcome recording, "synthetic data" labels.
 
**Left out for now:** real GitHub ingestion, skipping tests automatically, deep learning, MLflow, Evidently and Docker as requirements, authentication, real-time streaming.
 
## Build order
 
| Phase | Goal | Done when |
|---|---|---|
| 1. Simulator and contract | Seeded simulator, schema, feature contract | Same seed gives an identical dataset; a test fails if a post-run field is used |
| 2. Models and report | Baselines, candidate, calibration, threshold analysis | One command produces the same report every time |
| 3. Gate and API | Promotion gate, registry table, predict and outcome endpoints | A weaker candidate is rejected automatically |
| 4. Dashboard | Risk, signals, prediction vs outcome | You can see a run's risk before its outcome exists |
| 5. CI and extras | GitHub Actions tests plus a quick evaluation | CI green on a fixed seed. Optional: drift report, real-data check |
 
## Learn first
 
| Topic | Why | Starting resource |
|---|---|---|
| Data leakage | Main reason such models look better than they are | scikit-learn docs: Common pitfalls |
| Time-based validation | Random splits are wrong for time-ordered data | scikit-learn TimeSeriesSplit |
| PR-AUC for imbalanced data | Failures are the rare class | scikit-learn precision_recall_curve |
| Calibration | Does "70%" really mean 70%? | scikit-learn calibration guide; Brier score |
| CI failure research | Realistic failure causes | arXiv 2602.02307 (flaky builds in GitHub Actions); APSEC 2024 GHA-BFP |
| Public dataset (optional) | External check | Mendeley Data: GitHub Actions CI/CD failure dataset, doi 10.17632/mggwn7rj9f.1 |
 
## Main risks
 
| Risk | Mitigation |
|---|---|
| Model only learns the simulator's own rules | Several scenario mixes, noise, drift, a held-out scenario, a real-data check later |
| Data leakage | Feature-contract test, outcomes in a separate table, rolling features from earlier finished runs only |
| Overclaiming | Always say synthetic; report mean and spread across seeds |
| Looks like a toy | Rigorous evaluation, a gate with recorded reasons, an honest limits section |
| Scope creep into MLflow, Docker, real GitHub | Keep them optional until phases 1 to 5 are done |
 
## Status against this plan
 
Updated for the current repository. Keep this section current as work lands.
 
**Built (MVP):** simulator with 4 scenarios; feature contract with leakage tests; time split; majority and logistic regression baselines plus gradient boosting, random forest and a deliberately weak candidate; evaluation (PR-AUC, recall at fixed precision, Brier, reliability, thresholds, importances); promotion gate; prediction API that refuses post-run fields and finished runs; outcome recording; dashboard (Runs, Run detail, Models, Tracker); synthetic-data banner; GitHub Actions (green).

**Built (Post-MVP):**
1. Multi-seed report in the product: in-memory multi-seed sweep (`execute_sweep`), persistent `sweeps` table, `POST /api/reports/sweep`, `GET /api/reports/sweeps/latest`, and "Seed sweep" panel with all four data states on `/models` and `/design`.
2. Held-out scenario test: `run_experiment(..., holdout_repo=...)` where train and validation exclude the held-out repo and the test set is only that repo (time-ordered within each part); leave-one-scenario-out evaluation across all 4 scenarios in sweep and model report, displayed in `/models` with an honest robustness note.
3. Feature ablation study and deliberate leakage verification:
   - Candidate retraining per feature group removed (`rolling_history`, `queue_and_timing`, `change_size`, `dependency_and_ci_flags`) reporting PR-AUC and delta PR-AUC against the full model as mean and spread over the sweep seeds.
   - Deliberate leak verification: giving a copy of the pipeline forbidden field `duration_s` demonstrates that both `enforce_contract()` raises `ContractViolation` loudly and the promotion gate catches it loudly on `leakage_contract` (rejecting candidate promotion).
   - Endpoints: `GET /api/reports/ablation` and `POST /api/reports/ablation`, backed by `AblationRecord` in the `ablations` table.
   - UI: `AblationPanel` on `/models` with all 4 data states, mock data in `src/lib/mocks.ts`, and a `/design` entry in `DesignSystemPage.tsx`.
4. Threshold chooser and before/after calibration view:
   - Interactive threshold chooser (`ThresholdChooser.tsx`) on `/models` with synchronised labelled range slider and number input, live-updating precision, recall and runs flagged via linear interpolation from evaluated report thresholds.
   - Identifies and highlights the lowest threshold meeting the configured precision target, with a one-click action to apply it.
   - Preserves threshold state in URL query parameters with `useUrlState`.
   - Calibration impact: shows candidate Brier score before (`brier_uncalibrated`) and after Platt calibration (`brier`) along with the calibration delta.
   - Documented on `/design` with live controls and added to mock data and component tests.
5. Real-data check on public GitHub Actions dataset (Mendeley Data DOI 10.17632/mggwn7rj9f.1, CC BY 4.0):
   - Added `backend/app/realdata/` with a loader that maps only columns known at run start onto the feature contract and drops all post-run or target-leaking fields.
   - Fully documented column mappings and unbuildable features in `backend/app/realdata/README.md`.
   - Dynamic feature evaluation: contract features unbuildable from dataset metadata (`touches_dependencies`, `touches_ci_config`, `queue_depth_at_start`) are completely omitted without imputation (never filled with synthetic defaults or zeros).
   - Strict temporal split and promotion gating: real dataset runs through the time-ordered split, candidate/baseline models, and promotion gate without mixing synthetic and real rows.
   - CLI: `python -m app.cli realdata <path> [--candidate hist_gb] [--max-rows N] [--seed S]` evaluates real data and persists the report in `realdata_reports`.
   - API: `GET /api/reports/realdata` exposes the latest evaluation.
   - UI: dedicated "Real data check" section on `/models` and `/design` with all 4 data states (`DataState`), dataset metadata, limits callout explicitly stating unbuildable features are not imputed, scores table, and gate checks.
   - Safety: dataset paths and CSVs excluded via `.gitignore`.
6. Database schema management with Alembic:
   - Replaced `Base.metadata.create_all` with programmatic Alembic migration execution on app start for SQLite.
   - Generated initial migration `1d1542866a6c_initial_migration.py` covering all 8 ORM tables (`runs`, `outcomes`, `sim_truth`, `models`, `predictions`, `sweeps`, `ablations`, `realdata_reports`) with indices and foreign keys.
   - Automatic SQLite migration handling: upgrades empty databases to head, and stamps pre-existing tables.
   - Added schema agreement test (`test_migrations.py`) verifying that upgrading an empty database to head matches the ORM models with zero diff (`compare_metadata == []`), and tests downgrade and re-upgrade cycles.
   - Added `alembic>=1.13` to `backend/requirements.txt` and documented `alembic revision --autogenerate` and `alembic upgrade head` in `README.md`.
7. Data drift analysis and simulator drift option:
   - Built drift statistics in pure numpy and scipy (`app/ml/drift.py`) computing Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) test per numeric feature, plus a category share breakdown table.
   - Plain-language status classification per feature (`stable`, `watch`, `shifted`) with actionable recommendations for each status.
   - Simulator drift option (`drift=True`, `drift_queue_boost`) in `simulate()` and `simulate_scenario()` that elevates queue depth on demand so distribution shift can be demonstrated.
   - Endpoint: `GET /api/drift` comparing active model training window to recent live runs.
   - Frontend: dedicated `/drift` screen with `DriftPanel`, top-bar navigation link, numeric features table sorted by PSI, category share breakdown table, and demonstration controls ('Add live runs', 'Simulate drift') with all 4 data states (`DataState`).
   - Mock data and `/design` entry in `DesignSystemPage.tsx`.
   - Tests: backend unit and integration tests (`test_drift.py`) covering PSI and KS test on known inputs, category shares, simulator drift option, and API endpoint; frontend component tests in `components.test.tsx`.
8. Optional MLflow tracking and Docker Compose stack:
   - Optional MLflow tracking (`backend/app/ml/tracking.py`) behind environment flag `CI_ENABLE_MLFLOW` (off by default, local file store `data/mlruns`, no server required).
   - Automatically logs algorithm hyperparameters, gate decision, evaluation metrics (PR-AUC, Brier score, recall at precision), and the serialized model artifact for each training run.
   - Core app and CI remain completely independent of MLflow and Docker (graceful fallback if `mlflow` is not installed).
   - Containerization: added `docker-compose.yml`, root `.dockerignore`, `backend/Dockerfile`, `frontend/Dockerfile`, and `frontend/nginx.conf` for single-command full-stack deployment (`docker compose up --build`).
   - Added instructions to `README.md` and unit tests in `backend/tests/test_mlflow.py`.
9. Playwright E2E test suite and responsive phone layout:
   - Added Playwright end-to-end test suite (`frontend/e2e/ci-flow.spec.ts`) against `npm run dev:mock` covering complete user journey: generate dataset, open pending run, score it before finishing, finish run, see comparison on prediction tracker, train weak stump model and verify gate rejection, and run multi-seed sweep verifying summary and leave-one-scenario-out tables.
   - Added screenshot tests at 1280px and 375px wide for Runs, Run detail, Models, and Tracker, asserting zero horizontal body overflow (`scrollWidth <= 375px`).
   - Phone table layout improvements: adapted Runs table for mobile by prioritizing Run name/workflow, repository subtitle, risk cell, and status badge into clean 3-column view, moving lines changed and timestamp to desktop/tablet viewports.
   - Fixed responsive overflow bugs on mobile: constrained candidate `<select>` dropdown with truncation, wrapped containers with `min-w-0 max-w-full`, prevented header scroll blowouts, and fixed React Router search param batching in `useUrlState`.
   - Added `e2e` job to `.github/workflows/ci.yml` with Playwright installation, test run, and screenshot artifact uploads.
10. Phone table restack (Brief 1) and accessibility pass (Brief 6):
   - Implemented narrow screen table restacking for the Runs table in `RunsPage.tsx`: on viewports under 40rem (<640px), each row restacks into a labelled block displaying the run link, status badge, risk reading, and labelled metadata (repository, lines changed, started timestamp) without horizontal scrolling, while preserving real `<table>` semantics on wide screens (`hidden sm:block`).
   - Added Table examples at both widths on `/design` (`DesignSystemPage.tsx`): wide semantic table alongside the narrow-screen labelled block restack.
   - Audited every screen for keyboard-only navigation and screen readers:
     - Added "Skip to main content" link at the top of `AppShell.tsx` targeting `<main id="main-content" tabIndex={-1}>`.
     - Added `aria-live="assertive"` on error alert regions in `RunsPage.tsx`, `RunDetailPage.tsx`, `ModelsPage.tsx`, and `DataState.tsx`.
     - Added `aria-live="polite"` on pagination summary and skeletons.
     - Added accessible labels for slider range inputs (`aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`) in `ThresholdChooser.tsx`.
     - Added accessible labels on pagination buttons, model selection buttons, and recent prediction links.
     - Verified all colors adhere to the locked Console token palette with contrast ratios meeting or exceeding WCAG AA standards.
11. Results document generation CLI (`python -m app.cli results`) and `docs/RESULTS.md`:
   - Created `backend/app/services_results.py` and `backend/app/cli.py results`: regenerates `docs/RESULTS.md` directly from real runs of the multi-seed sweep, leave-one-scenario-out generalisation, feature group ablation, deliberate leakage check, and real-data checks.
   - Outputs empirical numbers with mean and spread across seeds without any hand-typed figures.
   - Clearly documents honest limitations and simulator assumptions at the top of the report.
   - Provides exactly one plain paragraph under each of the plan's four success measures ("Beats the baseline", "No leakage", "Calibrated", "Works on real data") detailing what the numbers do and do not support.
   - Added `backend/tests/test_results.py` verifying file generation, report headers, and non-empty sections.
   - Added concise "Results" section to `README.md` linking directly to `docs/RESULTS.md`.

**Not yet built:**

None. All planned engineering milestones, tests, checks, extensions, and documentation are complete.

**Files touched:**
- `backend/app/services_results.py`: Service running real benchmarks and generating `docs/RESULTS.md`.
- `backend/app/cli.py`: Added `python -m app.cli results` subcommand with configurable seeds, runs, and candidate.
- `backend/tests/test_results.py`: Automated test covering report generation and section structure.
- `docs/RESULTS.md`: Empirical benchmark report regenerated directly from script execution.
- `README.md`: Added Results section linking to `docs/RESULTS.md`.
- `frontend/e2e/ci-flow.spec.ts`: Playwright end-to-end test covering full workflow and responsive screenshot checks.
- `frontend/playwright.config.ts`: Playwright configuration with mock server lifecycle and viewport setup.
- `frontend/screenshots/`: Generated desktop (1280px) and mobile (375px) screenshots for Runs, Run detail, Models, and Tracker.
- `.github/workflows/ci.yml`: Added `e2e` test job with Chromium dependencies and screenshot artifact uploading.
- `frontend/src/pages/RunsPage.tsx`: Phone table layout displaying core signals (Run, Risk, Status) and atomic URL state updates.
- `frontend/src/pages/ModelsPage.tsx`: Responsive table wrapping and mobile header abbreviation.
- `frontend/src/components/ui/Field.tsx`: Added `truncate` and viewport max-width capping for selects.
- `frontend/src/components/ui/Panel.tsx`: Added `min-w-0 max-w-full` container constraints.
- `frontend/src/components/ui/Table.tsx`: Added `w-full max-w-full` container wrapping for responsive tables.
- `frontend/src/components/layout/AppShell.tsx`: Header overflow containment and mobile nav spacing.
- `frontend/src/lib/useUrlState.ts`: Fixed no-op param updates to prevent clobbering in React Router.
- `frontend/vite.config.ts`: Scoped Vitest test discovery to `src/` to prevent conflict with Playwright tests.
- `frontend/package.json`: Added `test:e2e` script and `@playwright/test` dev dependency.
- `.gitignore`: Added `test-results/` and `playwright-report/`.
- `docker-compose.yml`: Multi-container stack with FastAPI backend and static Nginx frontend.
- `.dockerignore`: Ignored local environments, node_modules, build artifacts, and databases.
- `backend/Dockerfile`: Container image for FastAPI backend.
- `frontend/Dockerfile`: Multi-stage build for frontend static assets with Nginx.
- `frontend/nginx.conf`: Nginx configuration for static assets and `/api` reverse proxying.
- `.gitignore`: Excluded dataset downloads (`data/`, `*.csv`, `*.csv.zip`).
- `README.md`: Documented Alembic migration commands, Docker Compose usage, and optional MLflow tracking.
- `backend/requirements.txt`: Added `alembic>=1.13` and `scipy>=1.13`.
- `backend/alembic.ini`: Configured Alembic with SQLite database URL and script directory.
- `backend/alembic/env.py`: Alembic environment linking `Base.metadata` and SQLite batch transaction execution.
- `backend/alembic/script.py.mako`: Migration template.
- `backend/alembic/versions/1d1542866a6c_initial_migration.py`: Initial migration containing all 8 tables, indexes, and foreign keys.
- `backend/app/db.py`: Replaced `Base.metadata.create_all` with `run_migrations(engine)` on SQLite engine init.
- `backend/app/config.py`: Added MLflow configuration settings (`enable_mlflow`, `mlflow_tracking_uri`, `mlflow_experiment_name`).
- `backend/app/contract.py`: Defined `FEATURE_GROUPS`, `ContractViolation`, and `enforce_contract()` helper.
- `backend/app/ml/drift.py`: Pure numpy/scipy implementations for PSI, KS tests, category shares, and status classification.
- `backend/app/ml/tracking.py`: Optional MLflow experiment tracking logger for model parameters, metrics, and artifacts.
- `backend/app/ml/features.py`: Supported dynamic feature subsets so unbuildable features can be omitted without imputation.
- `backend/app/ml/pipeline.py`: Added dynamic feature subsets (`drop_features`, `leak_column`) and `holdout_repo` parameter to `run_experiment()`.
- `backend/app/simulator/generate.py`: Added `drift` and `drift_queue_boost` options to simulate distribution shifts.
- `backend/app/realdata/__init__.py`: Real data package interface.
- `backend/app/realdata/README.md`: Documentation of real dataset column mapping, dropped columns, and limits.
- `backend/app/realdata/loader.py`: Real data loader with column validation and mapping.
- `backend/app/realdata/service.py`: Real data evaluation service and database persistence.
- `backend/app/services_drift.py`: Service computing distribution drift between training window and recent live runs.
- `backend/app/orm.py`: Added `SweepRecord`, `AblationRecord`, and `RealDataRecord` (`realdata_reports` table).
- `backend/app/schemas.py`: Added schemas for sweep, ablation, real data, and drift report (`NumericDriftRow`, `CategoricalDriftRow`, `DriftReportOut`, updated `LiveRunsRequest`).
- `backend/app/services_data.py`: Added `drift` parameter to `add_live_runs`.
- `backend/app/services_models.py`: Hooked optional MLflow tracking into model training and added held-out scenario generalisation.
- `backend/app/services_sweep.py`: In-memory multi-seed sweep service and leave-one-out evaluation.
- `backend/app/services_ablation.py`: Feature ablation service and deliberate leakage test execution.
- `backend/app/api/drift.py`: Added `GET /api/drift`.
- `backend/app/api/models.py`: Added endpoints for sweep, ablation, and real data (`GET /api/reports/realdata`).
- `backend/app/api/sim.py`: Passed `drift` parameter in `POST /api/simulate/live`.
- `backend/app/api/serializers.py`: Added `sweep_out`, `ablation_out`, `generalisation`, and `realdata_out`.
- `backend/app/cli.py`: Updated sweep CLI and added `python -m app.cli realdata <path>`.
- `backend/tests/test_sweep.py`: Tests for sweep determinism and held-out repo isolation.
- `backend/tests/test_ablation.py`: Tests for ablation determinism, deliberate leak ContractViolation, and gate failure.
- `backend/tests/test_realdata.py`: Tests for real data loader, pipeline and gate evaluation, unbuildable feature omission, and persistence.
- `backend/tests/test_migrations.py`: Tests for empty DB upgrade, ORM schema agreement via `compare_metadata`, downgrade, and re-upgrade.
- `backend/tests/test_drift.py`: Tests for PSI, KS tests, category shares, simulator drift option, and `/api/drift` endpoint.
- `backend/tests/test_mlflow.py`: Tests for optional MLflow tracking disabled by default, logging when enabled, and fallback when missing.
- `frontend/src/lib/types.ts`: TypeScript interfaces for sweeps, ablations, real data, and drift reports (`DriftReport`, `NumericDriftRow`, `CategoricalDriftRow`).
- `frontend/src/lib/format.ts`: Added `formatSpread()` helper.
- `frontend/src/lib/api.ts`: Added API client functions for sweeps, ablations, real data, and `drift`.
- `frontend/src/lib/hooks.ts`: Added `useDrift` query hook and updated `useLiveRuns`.
- `frontend/src/lib/mocks.ts`: Added mock sweep, ablation, `SAMPLE_REALDATA_REPORT`, and `SAMPLE_DRIFT_REPORT` with mock route handlers.
- `frontend/src/components/layout/AppShell.tsx`: Added Drift link to top navigation bar.
- `frontend/src/App.tsx`: Added `/drift` route.
- `frontend/src/pages/DriftPage.tsx`: Screen for data drift with live run simulation and drift demonstration buttons.
- `frontend/src/components/domain/DriftPanel.tsx`: Drift panel with numeric table sorted by PSI, plain-language status badges, what-to-do advice, category share breakdown, and all 4 data states.
- `frontend/src/components/domain/SweepPanel.tsx`: Seed sweep panel with all 4 data states and leave-one-out table.
- `frontend/src/components/domain/AblationPanel.tsx`: Feature ablation panel and deliberate leak verification cards.
- `frontend/src/components/domain/ThresholdChooser.tsx`: Interactive threshold chooser with slider, number field, target threshold, and interpolation.
- `frontend/src/components/domain/RealDataPanel.tsx`: Real data check panel with all 4 data states, dataset metadata, limits note, scores table, and gate checks.
- `frontend/src/pages/ModelsPage.tsx`: Integrated `SweepPanel`, `AblationPanel`, `RealDataPanel`, and `ThresholdChooser`.
- `frontend/src/pages/DesignSystemPage.tsx`: Added `SweepPanel`, `AblationPanel`, `RealDataPanel`, `DriftPanel`, and `ThresholdChooser` to `/design`.
- `frontend/src/test/setup.ts`: Configured testing-library cleanup between tests.
- `frontend/src/test/components.test.tsx`: Tests for domain components including `DriftPanel`, `DriftTable`, `RealDataPanel`, and `RealDataTable`.

**Known limitation:** the simulator is mostly logistic, so logistic regression is a strong baseline and the candidate only narrowly beats it. The gate rejecting some seeds is expected behaviour.
 