"""In-memory feature ablation and deliberate leakage verification."""

from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from .clock import utcnow
from .config import Settings
from .contract import FEATURE_COLUMNS, FEATURE_GROUPS, ContractViolation, enforce_contract
from .ml.pipeline import run_experiment
from .orm import AblationRecord
from .services_data import NotFound, pick_scenarios
from .simulator.generate import simulate


def execute_ablation(
    settings: Settings,
    seeds: int = 5,
    runs_per_scenario: int = 1000,
    candidate: str = "hist_gb",
) -> dict[str, Any]:
    scenarios = pick_scenarios(settings, None)

    full_pr_aucs: list[float] = []
    group_pr_aucs: dict[str, list[float]] = {gid: [] for gid in FEATURE_GROUPS}
    group_deltas: dict[str, list[float]] = {gid: [] for gid in FEATURE_GROUPS}

    first_frame = None
    for seed in range(seeds):
        frame = simulate(scenarios, runs_per_scenario, seed)
        if first_frame is None:
            first_frame = frame

        # Full candidate model
        full_exp = run_experiment(
            frame,
            seed=seed,
            candidate_kind=candidate,
            precision_target=settings.precision_target,
            gate_margin=settings.gate_margin,
            brier_tolerance=settings.brier_tolerance,
            rolling_window=settings.rolling_window,
        )
        full_score = float(full_exp.metrics["candidate"]["pr_auc"])
        full_pr_aucs.append(full_score)

        # Retrain candidate once per feature group removed
        for gid, ginfo in FEATURE_GROUPS.items():
            ablated_exp = run_experiment(
                frame,
                seed=seed,
                candidate_kind=candidate,
                drop_features=ginfo["features"],
                precision_target=settings.precision_target,
                gate_margin=settings.gate_margin,
                brier_tolerance=settings.brier_tolerance,
                rolling_window=settings.rolling_window,
            )
            ablated_score = float(ablated_exp.metrics["candidate"]["pr_auc"])
            group_pr_aucs[gid].append(ablated_score)
            group_deltas[gid].append(ablated_score - full_score)

    def _calc_spread(vals: list[float]) -> dict[str, float | None]:
        if not vals:
            return {"mean": None, "spread": None}
        return {"mean": round(float(np.mean(vals)), 4), "spread": round(float(np.std(vals)), 4)}

    full_summary = _calc_spread(full_pr_aucs)

    groups_result: list[dict[str, Any]] = []
    for gid, ginfo in FEATURE_GROUPS.items():
        groups_result.append(
            {
                "group_id": gid,
                "name": ginfo["name"],
                "features": ginfo["features"],
                "pr_auc": _calc_spread(group_pr_aucs[gid]),
                "delta_pr_auc": _calc_spread(group_deltas[gid]),
            }
        )

    # Deliberate leak test: give forbidden field duration_s as feature
    contract_caught = False
    contract_error = ""
    try:
        enforce_contract([*FEATURE_COLUMNS, "duration_s"])
    except ContractViolation as e:
        contract_caught = True
        contract_error = str(e)

    assert first_frame is not None
    leak_exp = run_experiment(
        first_frame,
        seed=0,
        candidate_kind=candidate,
        leak_column="duration_s",
        precision_target=settings.precision_target,
        gate_margin=settings.gate_margin,
        brier_tolerance=settings.brier_tolerance,
        rolling_window=settings.rolling_window,
    )
    gate_caught = not leak_exp.gate.passed and any("duration_s" in v for v in leak_exp.leakage_violations)

    deliberate_leak = {
        "forbidden_field": "duration_s",
        "contract_caught": contract_caught,
        "contract_error": contract_error,
        "gate_caught": gate_caught,
        "gate_passed": leak_exp.gate.passed,
        "gate_violations": leak_exp.leakage_violations,
    }

    return {
        "seeds": seeds,
        "runs_per_scenario": runs_per_scenario,
        "candidate": candidate,
        "full_model_pr_auc": full_summary,
        "groups": groups_result,
        "deliberate_leak": deliberate_leak,
    }


def create_ablation(
    db: Session,
    settings: Settings,
    seeds: int = 5,
    runs_per_scenario: int = 1000,
    candidate: str = "hist_gb",
) -> AblationRecord:
    data = execute_ablation(settings, seeds, runs_per_scenario, candidate)
    record = AblationRecord(
        created_at=utcnow(),
        seeds=seeds,
        runs_per_scenario=runs_per_scenario,
        candidate=candidate,
        full_model_pr_auc=data["full_model_pr_auc"],
        groups=data["groups"],
        deliberate_leak=data["deliberate_leak"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_latest_ablation(db: Session) -> AblationRecord:
    rec = db.scalars(select(AblationRecord).order_by(AblationRecord.created_at.desc())).first()
    if rec is None:
        raise NotFound("No ablation record exists yet.")
    return rec
