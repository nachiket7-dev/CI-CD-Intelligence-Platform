"""Tests for the seed sweep service and endpoints."""

from app.config import Settings
from app.services_sweep import execute_sweep


def test_sweep_determinism_same_seeds_same_numbers():
    settings = Settings.from_env()
    # 100 runs per scenario gives 400 total runs (> 300 MIN_RUNS required)
    res1 = execute_sweep(settings, seeds=2, runs_per_scenario=100, candidate="hist_gb")
    res2 = execute_sweep(settings, seeds=2, runs_per_scenario=100, candidate="hist_gb")

    assert res1["seeds"] == res2["seeds"] == 2
    assert res1["candidate"] == res2["candidate"] == "hist_gb"
    assert res1["gate_pass_rate"] == res2["gate_pass_rate"]
    assert res1["passed_seeds"] == res2["passed_seeds"]

    for model in ("majority", "logreg", "candidate"):
        for metric in ("pr_auc", "brier", "recall"):
            assert res1["metrics"][model][metric] == res2["metrics"][model][metric]

    assert res1["leave_one_out"] == res2["leave_one_out"]


def test_sweep_api_stores_and_returns_latest_in_memory(client):
    # Before any sweep, latest should 404
    res = client.get("/api/reports/sweeps/latest")
    assert res.status_code == 404

    # Run sweep via API
    sweep_payload = {"seeds": 2, "runs_per_scenario": 100, "candidate": "hist_gb"}
    post_res = client.post("/api/reports/sweep", json=sweep_payload)
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["seeds"] == 2
    assert data["runs_per_scenario"] == 100
    assert data["candidate"] == "hist_gb"
    assert "metrics" in data
    assert "majority" in data["metrics"]
    assert "logreg" in data["metrics"]
    assert "candidate" in data["metrics"]
    assert isinstance(data["metrics"]["candidate"]["pr_auc"]["mean"], float)
    assert isinstance(data["gate_pass_rate"], float)

    # In-memory execution must NOT have created runs in the database
    runs_res = client.get("/api/runs")
    assert runs_res.json()["counts"]["total"] == 0

    # GET /api/reports/sweeps/latest should now return the exact stored sweep
    latest_res = client.get("/api/reports/sweeps/latest")
    assert latest_res.status_code == 200
    latest_data = latest_res.json()
    assert latest_data["id"] == data["id"]
    assert latest_data["metrics"] == data["metrics"]
    assert "leave_one_out" in latest_data
    assert len(latest_data["leave_one_out"]) == 4
    assert latest_data["leave_one_out"][0]["scenario"] == "busy-queue"
    assert isinstance(latest_data["leave_one_out"][0]["candidate_pr_auc"]["mean"], float)


def test_sweep_weak_candidate(client):
    res = client.post(
        "/api/reports/sweep",
        json={"seeds": 2, "runs_per_scenario": 100, "candidate": "weak_stump"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["candidate"] == "weak_stump"
    assert data["gate_pass_rate"] == 0.0
    assert data["passed_seeds"] == 0
    # Candidate was rejected by the gate across seeds
    assert data["gate_pass_rate"] == 0.0


def test_holdout_repo_never_appears_in_train_rows(scenarios):
    from app.ml.pipeline import run_experiment
    from app.simulator.generate import simulate

    frame = simulate(scenarios, 100, seed=42)
    for s in scenarios:
        holdout = s.name
        exp = run_experiment(frame, seed=42, candidate_kind="hist_gb", holdout_repo=holdout)
        assert exp.holdout_repo == holdout

        # The test set has exactly all the held-out repo runs
        test_runs = frame[frame["repo"] == holdout]
        assert exp.n_test == len(test_runs)

        # The held-out repo never appears in train or val rows
        train_val_runs = frame[frame["repo"] != holdout]
        assert exp.n_train + exp.n_val == len(train_val_runs)
        ordered_tv = train_val_runs.sort_values("started_at").index
        assert holdout not in frame.loc[ordered_tv[: exp.n_train], "repo"].values
        assert holdout not in frame.loc[ordered_tv[exp.n_train :], "repo"].values

        # All 3 models have PR-AUC on the held-out repo
        for model in ("majority", "logreg", "candidate"):
            assert isinstance(exp.metrics[model]["pr_auc"], float)
