from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_session
from ..schemas import LiveRunsRequest, RunCounts, RunOut, SimulateRequest
from ..services_data import add_live_runs, counts, scenario_catalog, simulate_into_db
from ..services_models import active_model, predict_for_run
from .deps import SettingsDep
from .serializers import run_out

router = APIRouter(tags=["simulator"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/scenarios")
def list_scenarios(settings: SettingsDep) -> list[dict[str, str]]:
    return [{"name": s.name, "description": s.description} for s in scenario_catalog(settings).values()]


@router.post("/simulate", response_model=RunCounts)
def simulate(body: SimulateRequest, db: DB, settings: SettingsDep) -> RunCounts:
    """Replace all runs with a freshly simulated dataset. The model registry is kept."""
    return RunCounts(
        **simulate_into_db(db, settings, body.scenarios, body.runs_per_scenario, body.seed, body.pending)
    )


@router.post("/simulate/live", response_model=list[RunOut])
def live_runs(body: LiveRunsRequest, db: DB, settings: SettingsDep) -> list[RunOut]:
    """Add new pending runs. If a model is active, each one is scored before it can finish."""
    runs = add_live_runs(
        db,
        settings,
        body.count,
        body.seed,
        drift=body.drift,
        drift_queue_boost=body.drift_queue_boost,
    )
    if active_model(db) is not None:
        for run in runs:
            predict_for_run(db, settings, run)
    return [run_out(r) for r in runs]


@router.get("/counts", response_model=RunCounts)
def run_counts(db: DB) -> RunCounts:
    return RunCounts(**counts(db))
