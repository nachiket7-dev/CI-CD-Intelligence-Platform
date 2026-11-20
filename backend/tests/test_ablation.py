"""Tests for feature ablation and deliberate leakage verification."""

import pytest

from app.config import Settings
from app.contract import FEATURE_COLUMNS, ContractViolation, enforce_contract
from app.ml.pipeline import run_experiment
from app.services_ablation import execute_ablation
from app.services_data import pick_scenarios
from app.simulator.generate import simulate


def test_ablation_determinism_and_structure():
    settings = Settings.from_env()
    res1 = execute_ablation(settings, seeds=2, runs_per_scenario=100, candidate="hist_gb")
    res2 = execute_ablation(settings, seeds=2, runs_per_scenario=100, candidate="hist_gb")

    assert res1["seeds"] == res2["seeds"] == 2
    assert res1["candidate"] == res2["candidate"] == "hist_gb"
    assert res1["full_model_pr_auc"] == res2["full_model_pr_auc"]
    assert res1["groups"] == res2["groups"]
    assert res1["deliberate_leak"] == res2["deliberate_leak"]

    expected_groups = {
        "rolling_history",
        "queue_and_timing",
        "change_size",
        "dependency_and_ci_flags",
    }
    found_groups = {g["group_id"] for g in res1["groups"]}
    assert found_groups == expected_groups

    for group in res1["groups"]:
        assert isinstance(group["pr_auc"]["mean"], float)
        assert isinstance(group["pr_auc"]["spread"], float)
        assert isinstance(group["delta_pr_auc"]["mean"], float)
        assert isinstance(group["delta_pr_auc"]["spread"], float)
        assert len(group["features"]) > 0


def test_deliberate_leak_contract_violation_loud_failure():
    """Giving forbidden field duration_s must fail loudly via ContractViolation."""
    with pytest.raises(ContractViolation) as exc_info:
        enforce_contract([*FEATURE_COLUMNS, "duration_s"])
    assert "duration_s" in str(exc_info.value)
    assert "forbidden" in str(exc_info.value)


def test_deliberate_leak_gate_failure_loud():
    """Pipeline with duration_s must be caught by promotion gate and rejected loudly."""
    settings = Settings.from_env()
    scenarios = pick_scenarios(settings, None)
    frame = simulate(scenarios, 100, 42)

    exp = run_experiment(
        frame,
        seed=42,
        candidate_kind="hist_gb",
        leak_column="duration_s",
        precision_target=settings.precision_target,
        gate_margin=settings.gate_margin,
        brier_tolerance=settings.brier_tolerance,
        rolling_window=settings.rolling_window,
    )

    # Gate must NOT pass
    assert exp.gate.passed is False
    assert len(exp.leakage_violations) >= 1
    assert any("duration_s" in v for v in exp.leakage_violations)

    # Specific gate check for leakage must fail
    leakage_check = next((c for c in exp.gate.checks if c.name == "leakage_contract"), None)
    assert leakage_check is not None
    assert leakage_check.passed is False
    assert "duration_s" in leakage_check.detail


def test_ablation_api_endpoints(client):
    # Before running, GET returns 404
    get_res = client.get("/api/reports/ablation")
    assert get_res.status_code == 404

    # Run via POST
    payload = {"seeds": 2, "runs_per_scenario": 100, "candidate": "hist_gb"}
    post_res = client.post("/api/reports/ablation", json=payload)
    assert post_res.status_code == 200
    data = post_res.json()

    assert data["seeds"] == 2
    assert data["candidate"] == "hist_gb"
    assert "full_model_pr_auc" in data
    assert isinstance(data["full_model_pr_auc"]["mean"], float)
    assert len(data["groups"]) == 4

    # Verify deliberate leak report in API response
    leak_rep = data["deliberate_leak"]
    assert leak_rep["forbidden_field"] == "duration_s"
    assert leak_rep["contract_caught"] is True
    assert leak_rep["gate_caught"] is True
    assert leak_rep["gate_passed"] is False
    assert any("duration_s" in v for v in leak_rep["gate_violations"])

    # GET /api/reports/ablation returns the record
    get_res2 = client.get("/api/reports/ablation")
    assert get_res2.status_code == 200
    data2 = get_res2.json()
    assert data2["id"] == data["id"]
    assert data2["full_model_pr_auc"] == data["full_model_pr_auc"]
