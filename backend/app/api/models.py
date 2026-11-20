from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..orm import ModelRecord
from ..realdata import get_latest_realdata
from ..schemas import (
    AblationIn,
    AblationOut,
    ModelOut,
    RealDataReportOut,
    ReportOut,
    SweepOut,
    SweepRequest,
    TrackerOut,
    TrainRequest,
)
from ..services_ablation import create_ablation, get_latest_ablation
from ..services_data import NotFound
from ..services_models import get_model, predict_payload, promote, tracker, train
from ..services_sweep import create_sweep, get_latest_sweep
from .deps import SettingsDep
from .serializers import ablation_out, model_out, realdata_out, report_out, sweep_out

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


@router.get("/reports/ablation", response_model=AblationOut)
def latest_ablation_report(db: DB) -> AblationOut:
    return ablation_out(get_latest_ablation(db))


@router.get("/reports/realdata", response_model=RealDataReportOut)
def latest_realdata_report(db: DB) -> RealDataReportOut:
    return realdata_out(get_latest_realdata(db))


@router.post("/reports/ablation", response_model=AblationOut)
def run_ablation_report(
    body: AblationIn,
    db: DB,
    settings: SettingsDep,
) -> AblationOut:
    return ablation_out(
        create_ablation(
            db,
            settings,
            seeds=body.seeds,
            runs_per_scenario=body.runs_per_scenario,
            candidate=body.candidate,
        )
    )


@router.post("/reports/sweep", response_model=SweepOut)
def run_sweep_report(body: SweepRequest, db: DB, settings: SettingsDep) -> SweepOut:
    return sweep_out(
        create_sweep(
            db,
            settings,
            seeds=body.seeds,
            runs_per_scenario=body.runs_per_scenario,
            candidate=body.candidate,
        )
    )


@router.get("/reports/sweeps/latest", response_model=SweepOut)
@router.get("/reports/sweep/latest", response_model=SweepOut)
def latest_sweep_report(db: DB) -> SweepOut:
    return sweep_out(get_latest_sweep(db))


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
