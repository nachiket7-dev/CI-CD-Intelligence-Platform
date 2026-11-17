from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..orm import ModelRecord
from ..schemas import ModelOut, ReportOut, TrackerOut, TrainRequest
from ..services_data import NotFound
from ..services_models import get_model, predict_payload, promote, tracker, train
from .deps import SettingsDep
from .serializers import model_out, report_out

router = APIRouter(tags=["models"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/models", response_model=list[ModelOut])
def list_models(db: DB) -> list[ModelOut]:
    rows = db.scalars(select(ModelRecord).order_by(ModelRecord.id.desc())).all()
    return [model_out(r) for r in rows]


@router.post("/models/train", response_model=ModelOut)
def train_model(body: TrainRequest, db: DB, settings: SettingsDep) -> ModelOut:
    """Train the baselines and a candidate, then run the promotion gate. Weak candidates are rejected."""
    return model_out(train(db, settings, body.candidate, body.seed))


@router.post("/models/{model_id}/promote", response_model=ModelOut)
def promote_model(model_id: int, db: DB) -> ModelOut:
    return model_out(promote(db, get_model(db, model_id)))


@router.get("/reports/latest", response_model=ReportOut)
def latest_report(db: DB) -> ReportOut:
    record = db.scalars(select(ModelRecord).order_by(ModelRecord.id.desc())).first()
    if record is None:
        raise NotFound("No evaluation report yet. Train a model first.")
    return report_out(record)


@router.get("/reports/{model_id}", response_model=ReportOut)
def model_report(model_id: int, db: DB) -> ReportOut:
    return report_out(get_model(db, model_id))


@router.get("/tracker", response_model=TrackerOut)
def prediction_tracker(db: DB) -> dict[str, Any]:
    return tracker(db)


@router.post("/predict")
def predict(db: DB, payload: Annotated[dict[str, Any], Body()], settings: SettingsDep) -> dict[str, Any]:
    """Score an ad-hoc run from pre-run fields. Post-run fields are rejected."""
    return predict_payload(db, settings, payload)
