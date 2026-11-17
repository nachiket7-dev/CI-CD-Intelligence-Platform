from __future__ import annotations

from ..orm import ModelRecord, Run
from ..schemas import (
    ModelOut,
    OutcomeOut,
    PredictionOut,
    ReportOut,
    RunDetailOut,
    RunOut,
    TrailEvent,
)


def _latest(run: Run):
    return run.predictions[-1] if run.predictions else None


def run_out(run: Run) -> RunOut:
    pred = _latest(run)
    status = "pending" if run.outcome is None else ("failed" if run.outcome.failed else "passed")
    return RunOut(
        id=run.id,
        repo=run.repo,
        workflow_name=run.workflow_name,
        trigger_type=run.trigger_type,
        author=run.author,
        files_changed=run.files_changed,
        lines_changed=run.lines_changed,
        touches_dependencies=bool(run.touches_dependencies),
        touches_ci_config=bool(run.touches_ci_config),
        queue_depth_at_start=run.queue_depth_at_start,
        started_at=run.started_at,
        status=status,
        risk=pred.probability if pred else None,
        model_version=pred.model.version if pred else None,
    )


def prediction_out(run: Run) -> PredictionOut | None:
    pred = _latest(run)
    if pred is None:
        return None
    return PredictionOut(
        id=pred.id,
        probability=pred.probability,
        model_version=pred.model.version,
        predicted_at=pred.predicted_at,
        signals=pred.signals,
        features=pred.features,
    )


def run_detail(run: Run) -> RunDetailOut:
    pred, outcome = _latest(run), run.outcome
    trail = [TrailEvent(kind="started", label="Run started", at=run.started_at, clock="simulated")]
    if pred:
        trail.append(
            TrailEvent(
                kind="scored",
                label="Risk scored before the run finished",
                at=pred.predicted_at,
                clock="system",
            )
        )
    if outcome:
        trail.append(
            TrailEvent(
                kind="finished",
                label="Run failed" if outcome.failed else "Run passed",
                at=outcome.finished_at,
                clock="simulated",
            )
        )
        trail.append(
            TrailEvent(kind="recorded", label="Outcome recorded", at=outcome.recorded_at, clock="system")
        )
    base = run_out(run)
    return RunDetailOut(
        **base.model_dump(),
        prediction=prediction_out(run),
        outcome=OutcomeOut.model_validate(outcome) if outcome else None,
        trail=trail,
        predicted_before_outcome=(pred.predicted_at <= outcome.recorded_at) if pred and outcome else None,
    )


def model_out(record: ModelRecord) -> ModelOut:
    return ModelOut.model_validate(record, from_attributes=True)


def report_out(record: ModelRecord) -> ReportOut:
    return ReportOut(model=model_out(record), **record.report)
