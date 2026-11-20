"""Drift analysis endpoints comparing training window to recent live runs."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_session
from ..schemas import DriftReportOut
from ..services_drift import compute_drift

router = APIRouter(tags=["drift"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/drift", response_model=DriftReportOut)
def get_drift(
    db: DB,
    recent_runs: Annotated[int, Query(ge=5, le=500)] = 100,
    model_id: Annotated[int | None, Query()] = None,
) -> DriftReportOut:
    """Compare the active model's training window distribution to recent live runs."""
    return compute_drift(db, recent_runs=recent_runs, model_id=model_id)
