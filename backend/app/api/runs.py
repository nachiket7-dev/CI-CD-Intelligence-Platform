from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_session
from ..orm import Outcome, Prediction, Run
from ..schemas import OutcomeRequest, RunCounts, RunDetailOut, RunListOut, RunStatus
from ..services_data import counts, finish_from_simulator, get_run, record_outcome
from ..services_models import predict_for_run
from .deps import SettingsDep
from .serializers import run_detail, run_out

router = APIRouter(prefix="/runs", tags=["runs"])
DB = Annotated[Session, Depends(get_session)]


def _load(db: Session, run_id: int) -> Run:
    get_run(db, run_id)  # raises NotFound
    return db.scalars(
        select(Run)
        .where(Run.id == run_id)
        .options(selectinload(Run.outcome), selectinload(Run.predictions).selectinload(Prediction.model))
    ).one()


@router.get("", response_model=RunListOut)
def list_runs(
    db: DB,
    status: RunStatus | None = None,
    repo: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RunListOut:
    stmt = (
        select(Run)
        .outerjoin(Outcome, Outcome.run_id == Run.id)
        .options(selectinload(Run.outcome), selectinload(Run.predictions).selectinload(Prediction.model))
        .order_by(Run.started_at.desc(), Run.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if repo:
        stmt = stmt.where(Run.repo == repo)
    if status == "pending":
        stmt = stmt.where(Outcome.run_id.is_(None))
    elif status == "failed":
        stmt = stmt.where(Outcome.failed.is_(True))
    elif status == "passed":
        stmt = stmt.where(Outcome.failed.is_(False))
    repos = sorted(db.scalars(select(Run.repo).distinct()).all())
    return RunListOut(
        items=[run_out(r) for r in db.scalars(stmt).all()], counts=RunCounts(**counts(db, repo)), repos=repos
    )


@router.get("/{run_id}", response_model=RunDetailOut)
def read_run(run_id: int, db: DB) -> RunDetailOut:
    return run_detail(_load(db, run_id))


@router.post("/{run_id}/predict", response_model=RunDetailOut)
def score_run(run_id: int, db: DB, settings: SettingsDep) -> RunDetailOut:
    predict_for_run(db, settings, _load(db, run_id))
    return run_detail(_load(db, run_id))


@router.post("/{run_id}/outcome", response_model=RunDetailOut)
def post_outcome(run_id: int, body: OutcomeRequest, db: DB) -> RunDetailOut:
    record_outcome(db, _load(db, run_id), body.failed, body.duration_s)
    return run_detail(_load(db, run_id))


@router.post("/{run_id}/finish", response_model=RunDetailOut)
def finish_run(run_id: int, db: DB) -> RunDetailOut:
    """Demo helper: reveal the simulator's hidden result for a pending run and record it."""
    finish_from_simulator(db, _load(db, run_id))
    return run_detail(_load(db, run_id))
