from __future__ import annotations

from ..orm import AblationRecord, ModelRecord, RealDataRecord, Run, SweepRecord
from ..schemas import (
    AblationOut,
    ModelOut,
    OutcomeOut,
    PredictionOut,
    RealDataReportOut,
    ReportOut,
    RunDetailOut,
    RunOut,
    SweepOut,
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
    rep = dict(record.report)
    generalisation = rep.pop("generalisation", None)
    return ReportOut(model=model_out(record), generalisation=generalisation, **rep)


def sweep_out(record: SweepRecord) -> SweepOut:
    return SweepOut(
        id=record.id,
        created_at=record.created_at,
        seeds=record.seeds,
        runs_per_scenario=record.runs_per_scenario,
        candidate=record.candidate,
        precision_target=record.precision_target,
        gate_pass_rate=record.gate_pass_rate,
        passed_seeds=record.passed_seeds,
        metrics=record.metrics,
        leave_one_out=getattr(record, "leave_one_out", []) or [],
    )


def ablation_out(record: AblationRecord) -> AblationOut:
    return AblationOut(
        id=record.id,
        created_at=record.created_at,
        seeds=record.seeds,
        runs_per_scenario=record.runs_per_scenario,
        candidate=record.candidate,
        full_model_pr_auc=record.full_model_pr_auc,
        groups=record.groups,
        deliberate_leak=record.deliberate_leak,
    )


def realdata_out(record: RealDataRecord) -> RealDataReportOut:
    return RealDataReportOut(
        id=record.id,
        created_at=record.created_at,
        dataset_name=record.dataset_name,
        doi=record.doi,
        licence=record.licence,
        total_rows=record.total_rows,
        candidate=record.candidate,
        metrics=record.metrics,
        gate=record.gate,
        thresholds=record.thresholds,
        importances=record.importances,
        available_features=record.available_features,
        missing_contract_features=record.missing_contract_features,
        dropped_columns=record.dropped_columns,
    )
