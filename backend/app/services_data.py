"""Database operations for runs, outcomes and the simulator."""

from __future__ import annotations

from datetime import timedelta

import pandas as pd
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .clock import utcnow
from .config import Settings
from .contract import PRE_RUN_COLUMNS
from .orm import Outcome, Prediction, Run, SimTruth
from .simulator.generate import simulate
from .simulator.scenarios import Scenario, load_scenarios


class DomainError(Exception):
    """A request that is valid JSON but not valid for the current state (maps to HTTP 409)."""


class NotFound(Exception):
    pass


def scenario_catalog(settings: Settings) -> dict[str, Scenario]:
    return load_scenarios(settings.scenarios_dir)


def pick_scenarios(settings: Settings, names: list[str] | None) -> list[Scenario]:
    catalog = scenario_catalog(settings)
    chosen = names or list(catalog)
    unknown = [n for n in chosen if n not in catalog]
    if unknown:
        raise DomainError(f"Unknown scenario: {', '.join(unknown)}. Available: {', '.join(catalog)}.")
    return [catalog[n] for n in chosen]


def get_run(db: Session, run_id: int) -> Run:
    run = db.get(Run, run_id)
    if run is None:
        raise NotFound(f"Run {run_id} does not exist.")
    return run


def finished_runs_frame(db: Session) -> pd.DataFrame:
    """Finished runs: pre-run columns plus finished_at and failed (no duration, by design)."""
    rows = db.execute(
        select(Run, Outcome).join(Outcome, Outcome.run_id == Run.id).order_by(Run.started_at, Run.id)
    ).all()
    records = [
        {**{c: getattr(r, c) for c in PRE_RUN_COLUMNS}, "finished_at": o.finished_at, "failed": o.failed}
        for r, o in rows
    ]
    frame = pd.DataFrame.from_records(records)
    if frame.empty:
        return pd.DataFrame(columns=[*PRE_RUN_COLUMNS, "finished_at", "failed"])
    frame["started_at"] = pd.to_datetime(frame["started_at"])
    frame["finished_at"] = pd.to_datetime(frame["finished_at"])
    return frame


def counts(db: Session, repo: str | None = None) -> dict[str, int]:
    base = select(func.count()).select_from(Run)
    if repo:
        base = base.where(Run.repo == repo)
    total = db.scalar(base) or 0
    done = select(func.count()).select_from(Outcome).join(Run, Run.id == Outcome.run_id)
    if repo:
        done = done.where(Run.repo == repo)
    failed = db.scalar(done.where(Outcome.failed.is_(True))) or 0
    passed = db.scalar(done.where(Outcome.failed.is_(False))) or 0
    return {"total": total, "pending": total - failed - passed, "passed": passed, "failed": failed}


def _py(value):
    return value.item() if hasattr(value, "item") else value


def _store(db: Session, frame: pd.DataFrame, pending: int) -> list[Run]:
    now = utcnow()
    cutoff = len(frame) - pending
    runs: list[Run] = []
    for i, row in enumerate(frame.itertuples(index=False)):
        started = row.started_at.to_pydatetime()
        run = Run(
            **{c: _py(getattr(row, c)) for c in PRE_RUN_COLUMNS if c != "started_at"},
            started_at=started,
        )
        db.add(run)
        db.flush()
        finished_at = started + timedelta(seconds=float(row.duration_s))
        if i < cutoff:
            db.add(
                Outcome(
                    run_id=run.id,
                    failed=bool(row.failed),
                    duration_s=float(row.duration_s),
                    finished_at=finished_at,
                    recorded_at=now,
                )
            )
        else:
            db.add(SimTruth(run_id=run.id, failed=bool(row.failed), duration_s=float(row.duration_s)))
        runs.append(run)
    return runs


def simulate_into_db(
    db: Session, settings: Settings, names: list[str] | None, runs_per_scenario: int, seed: int, pending: int
) -> dict[str, int]:
    scenarios = pick_scenarios(settings, names)
    for table in (Prediction, SimTruth, Outcome, Run):  # replace runs; keep the model registry
        db.execute(delete(table))
    frame = simulate(scenarios, runs_per_scenario, seed)
    _store(db, frame, min(pending, len(frame)))
    db.commit()
    return counts(db)


def add_live_runs(db: Session, settings: Settings, count: int, seed: int | None) -> list[Run]:
    """Append pending runs after the latest run, as if new commits just arrived."""
    last = db.scalar(select(func.max(Run.started_at)))
    if last is None:
        raise DomainError("There are no runs yet. Generate a dataset first.")
    total = db.scalar(select(func.count()).select_from(Run)) or 0
    scenarios = pick_scenarios(settings, None)
    frame = simulate(
        scenarios, count, seed if seed is not None else 1000 + total, start_after=last, stream=total
    ).head(count)
    runs = _store(db, frame, pending=count)
    db.commit()
    return runs


def record_outcome(db: Session, run: Run, failed: bool, duration_s: float) -> Outcome:
    if run.outcome is not None:
        raise DomainError(f"Run {run.id} already has a recorded outcome.")
    outcome = Outcome(
        run_id=run.id,
        failed=failed,
        duration_s=duration_s,
        finished_at=run.started_at + timedelta(seconds=duration_s),
        recorded_at=utcnow(),
    )
    db.add(outcome)
    db.execute(delete(SimTruth).where(SimTruth.run_id == run.id))
    db.commit()
    db.refresh(run)
    return outcome


def finish_from_simulator(db: Session, run: Run) -> Outcome:
    truth = db.get(SimTruth, run.id)
    if truth is None:
        raise DomainError(f"Run {run.id} has no simulated result to reveal.")
    return record_outcome(db, run, truth.failed, truth.duration_s)
