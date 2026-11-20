"""Tests for drift measurement (PSI, KS test, category shares) and simulator drift option."""

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.ml.drift import calculate_ks, calculate_psi, category_shares, classify_psi
from app.services_data import pick_scenarios, simulate_into_db
from app.services_models import train
from app.simulator.generate import simulate


def test_psi_identical_distributions():
    """Identical distributions have 0 PSI."""
    vals = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0] * 50)
    psi = calculate_psi(vals, vals)
    assert psi == 0.0


def test_psi_known_shift():
    """Significantly shifted distribution produces high PSI (>= 0.2)."""
    rng = np.random.default_rng(123)
    ref = rng.normal(10.0, 2.0, size=1000)
    same = rng.normal(10.0, 2.0, size=1000)
    shifted = rng.normal(18.0, 2.0, size=1000)

    psi_same = calculate_psi(ref, same)
    psi_shifted = calculate_psi(ref, shifted)

    assert psi_same < 0.1, f"Expected stable PSI < 0.1, got {psi_same}"
    assert psi_shifted >= 0.2, f"Expected shifted PSI >= 0.2, got {psi_shifted}"


def test_psi_discrete_binary_feature():
    """Binary flags (touches_dependencies, touches_ci_config) compute PSI via discrete bins."""
    ref = np.array([0] * 900 + [1] * 100)
    same = np.array([0] * 890 + [1] * 110)
    shifted = np.array([0] * 200 + [1] * 800)

    psi_same = calculate_psi(ref, same)
    psi_shifted = calculate_psi(ref, shifted)

    assert psi_same < 0.1
    assert psi_shifted > 1.0


def test_ks_test_known_distributions():
    """KS test detects identical vs shifted continuous variables."""
    rng = np.random.default_rng(456)
    ref = rng.normal(0.0, 1.0, size=500)
    same = rng.normal(0.0, 1.0, size=500)
    shifted = rng.normal(3.0, 1.0, size=500)

    stat_same, p_same = calculate_ks(ref, same)
    stat_shifted, p_shifted = calculate_ks(ref, shifted)

    assert stat_same < 0.15
    assert p_same > 0.05
    assert stat_shifted > 0.7
    assert p_shifted < 1e-4


def test_category_shares_and_psi():
    """Category share table computes counts, proportions, deltas and category PSI."""
    ref_series = pd.Series(["push"] * 60 + ["pull_request"] * 30 + ["schedule"] * 10)
    live_series = pd.Series(["push"] * 20 + ["pull_request"] * 70 + ["schedule"] * 10)

    psi, shares = category_shares(ref_series, live_series)

    assert psi > 0.2
    assert len(shares) == 3

    pr_share = next(s for s in shares if s["category"] == "pull_request")
    assert pr_share["reference_count"] == 30
    assert pr_share["reference_share"] == 0.3
    assert pr_share["live_count"] == 70
    assert pr_share["live_share"] == 0.7
    assert round(pr_share["delta"], 2) == 0.40


def test_classify_psi_thresholds():
    """PSI thresholds classify into stable, watch, and shifted with advice."""
    status_0, advice_0 = classify_psi(0.04)
    status_1, advice_1 = classify_psi(0.15)
    status_2, advice_2 = classify_psi(0.35)

    assert status_0 == "stable"
    assert "No action" in advice_0

    assert status_1 == "watch"
    assert "Moderate shift" in advice_1

    assert status_2 == "shifted"
    assert "Significant shift" in advice_2


def test_simulator_drift_option():
    """Simulator drift option elevates queue depth on demand."""
    settings = Settings(database_url="sqlite://")
    scenarios = pick_scenarios(settings, ["busy-queue", "stable"])

    normal_df = simulate(scenarios, n_runs=50, seed=42, drift=False)
    drifted_df = simulate(scenarios, n_runs=50, seed=42, drift=True)

    normal_q = normal_df["queue_depth_at_start"].mean()
    drifted_q = drifted_df["queue_depth_at_start"].mean()

    assert drifted_q > normal_q + 10.0, f"Expected queue jump > 10, got {normal_q} -> {drifted_q}"


def test_api_drift_endpoint(tmp_path):
    """GET /api/drift returns 404 when no live runs, and full report when live runs exist."""
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/drift_test.db",
        models_dir=tmp_path / "models",
    )
    app = create_app(settings)
    client = TestClient(app)

    with app.state.db.session() as db:
        simulate_into_db(db, settings, None, runs_per_scenario=200, seed=42, pending=0)
        train(db, settings, "hist_gb", seed=42)

    # 1. No live runs after test window yet -> 404
    r1 = client.get("/api/drift")
    assert r1.status_code == 404

    # 2. Add normal live runs
    r_live = client.post("/api/simulate/live", json={"count": 20, "drift": False})
    assert r_live.status_code == 200

    r2 = client.get("/api/drift")
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["n_live"] == 20
    assert "numeric_features" in data2
    assert "categorical_features" in data2

    # 3. Add live runs with drift
    r_drift = client.post("/api/simulate/live", json={"count": 50, "drift": True})
    assert r_drift.status_code == 200

    r3 = client.get("/api/drift")
    assert r3.status_code == 200
    data3 = r3.json()
    queue_row = next(r for r in data3["numeric_features"] if r["feature"] == "queue_depth_at_start")
    assert queue_row["status"] == "shifted"
    assert queue_row["psi"] >= 0.2
    assert queue_row["live_mean"] > queue_row["reference_mean"] + 5.0
