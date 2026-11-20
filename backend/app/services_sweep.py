"""In-memory seed sweep across baselines and candidate models."""

from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from .clock import utcnow
from .config import Settings
from .ml.pipeline import run_experiment
from .orm import SweepRecord
from .services_data import NotFound, pick_scenarios
from .simulator.generate import simulate


def execute_sweep(
    settings: Settings,
    seeds: int = 5,
    runs_per_scenario: int = 1000,
    candidate: str = "hist_gb",
) -> dict[str, Any]:
    scenarios = pick_scenarios(settings, None)
    rows: dict[str, dict[str, list[float]]] = {
        k: {"pr_auc": [], "brier": [], "recall": []} for k in ("majority", "logreg", "candidate")
    }
    loo_rows: dict[str, dict[str, list[float]]] = {
        s.name: {"majority": [], "logreg": [], "candidate": []} for s in scenarios
    }
    passed = 0
    for seed in range(seeds):
        frame = simulate(scenarios, runs_per_scenario, seed)
        exp = run_experiment(
            frame,
            seed=seed,
            candidate_kind=candidate,
            precision_target=settings.precision_target,
            gate_margin=settings.gate_margin,
            brier_tolerance=settings.brier_tolerance,
            rolling_window=settings.rolling_window,
        )
        passed += int(exp.gate.passed)
        for name, m in exp.metrics.items():
            rows[name]["pr_auc"].append(float(m["pr_auc"]))
            rows[name]["brier"].append(float(m["brier"]))
            if m["recall_at_precision"] is not None:
                rows[name]["recall"].append(float(m["recall_at_precision"]))

        # Leave one scenario out for this seed
        for s in scenarios:
            exp_h = run_experiment(
                frame,
                seed=seed,
                candidate_kind=candidate,
                holdout_repo=s.name,
                precision_target=settings.precision_target,
                gate_margin=settings.gate_margin,
                brier_tolerance=settings.brier_tolerance,
                rolling_window=settings.rolling_window,
            )
            for m_name in ("majority", "logreg", "candidate"):
                loo_rows[s.name][m_name].append(float(exp_h.metrics[m_name]["pr_auc"]))

    def _calc_spread(vals: list[float]) -> dict[str, float | None]:
        if not vals:
            return {"mean": None, "spread": None}
        return {"mean": float(np.mean(vals)), "spread": float(np.std(vals))}

    metrics: dict[str, Any] = {}
    for name, r in rows.items():
        pr_auc_spread = _calc_spread(r["pr_auc"])
        brier_spread = _calc_spread(r["brier"])
        recall_spread = _calc_spread(r["recall"])
        metrics[name] = {
            "pr_auc": pr_auc_spread,
            "brier": brier_spread,
            "recall": recall_spread,
            "recall_at_precision": recall_spread,
        }

    leave_one_out = [
        {
            "scenario": s.name,
            "majority_pr_auc": _calc_spread(loo_rows[s.name]["majority"]),
            "logreg_pr_auc": _calc_spread(loo_rows[s.name]["logreg"]),
            "candidate_pr_auc": _calc_spread(loo_rows[s.name]["candidate"]),
        }
        for s in sorted(scenarios, key=lambda s: s.name)
    ]

    gate_pass_rate = float(passed / seeds) if seeds > 0 else 0.0

    return {
        "seeds": seeds,
        "runs_per_scenario": runs_per_scenario,
        "candidate": candidate,
        "precision_target": settings.precision_target,
        "gate_pass_rate": gate_pass_rate,
        "passed_seeds": passed,
        "metrics": metrics,
        "leave_one_out": leave_one_out,
    }


def create_sweep(
    db: Session,
    settings: Settings,
    seeds: int = 5,
    runs_per_scenario: int = 1000,
    candidate: str = "hist_gb",
) -> SweepRecord:
    data = execute_sweep(settings, seeds=seeds, runs_per_scenario=runs_per_scenario, candidate=candidate)
    record = SweepRecord(
        created_at=utcnow(),
        seeds=data["seeds"],
        runs_per_scenario=data["runs_per_scenario"],
        candidate=data["candidate"],
        precision_target=data["precision_target"],
        gate_pass_rate=data["gate_pass_rate"],
        passed_seeds=data["passed_seeds"],
        metrics=data["metrics"],
        leave_one_out=data["leave_one_out"],
    )
    db.add(record)
    db.commit()
    return record


def get_latest_sweep(db: Session) -> SweepRecord:
    record = db.scalars(select(SweepRecord).order_by(SweepRecord.id.desc())).first()
    if record is None:
        raise NotFound("No seed sweep report yet. Run a sweep first.")
    return record
