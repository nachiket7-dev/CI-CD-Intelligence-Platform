"""Tests for real-world CI/CD dataset loader, pipeline, and API endpoints."""

import pandas as pd

from app.config import Settings
from app.realdata import evaluate_realdata, load_realdata, run_and_save_realdata


def _make_sample_csv(path, n_rows=400):
    """Generate a CSV with the exact column schema of the Mendeley dataset."""
    base_time = pd.Timestamp("2026-01-01 08:00:00")
    records = []
    repos = ["home-assistant/core", "kubernetes/kubernetes", "facebook/react"]
    for i in range(n_rows):
        start = base_time + pd.Timedelta(minutes=i * 25)
        duration = 60 + (i % 10) * 45
        updated = start + pd.Timedelta(seconds=duration)
        conclusion = "success" if (i % 5 != 0) else "failure"
        records.append(
            {
                "run_id": 1000 + i,
                "repo": repos[i % len(repos)],
                "repo_name": repos[i % len(repos)],
                "commit_sha": f"sha_{i:06d}",
                "conclusion": conclusion,
                "status": "completed",
                "duration": float(duration),
                "created_at": str(start),
                "run_started_at": str(start),
                "updated_at": str(updated),
                "event": "push" if i % 2 == 0 else "pull_request",
                "head_branch": "main",
                "run_number": float(i + 1),
                "author_name": f"dev_{i % 8}",
                "author_email": f"dev_{i % 8}@example.com",
                "committer_name": "GitHub",
                "committer_email": "noreply@github.com",
                "authored_date": str(start),
                "committed_date": str(start),
                "message": f"Commit message {i}",
                "msg_len": len(f"Commit message {i}"),
                "is_merge": False,
                "num_parents": 1.0,
                "additions": 10 + (i % 50),
                "deletions": 5 + (i % 20),
                "total_churn": 15 + (i % 70),
                "files_modified": 1 + (i % 15),
                "timestamp_raw": str(start),
                "commit_date": str(start),
                "author": f"dev_{i % 8}",
                "workflow_id": f"wf_{i % 4}",
                "node_id": f"node_{i}",
                "head_sha": f"head_{i}",
                "run_attempt": 1.0,
                "actor_login": f"dev_{i % 8}",
                "triggering_actor_login": f"dev_{i % 8}",
                "time_since_last_commit": 3600.0,
                "timestamp": str(start),
            }
        )
    df = pd.DataFrame(records)
    df.to_csv(path, index=False)


def test_loader_maps_pre_run_columns_and_drops_forbidden(tmp_path):
    csv_file = tmp_path / "real_sample.csv"
    _make_sample_csv(csv_file, n_rows=400)

    clean_df, metadata = load_realdata(csv_file)

    assert len(clean_df) == 400
    assert metadata["licence"] == "CC BY 4.0"
    assert metadata["doi"] == "10.17632/mggwn7rj9f.1"

    # Pre-run contract columns present
    expected_present = {
        "repo",
        "workflow_name",
        "trigger_type",
        "author",
        "files_changed",
        "lines_changed",
        "started_at",
        "finished_at",
        "failed",
    }
    assert set(clean_df.columns) == expected_present

    # Unbuildable contract features must NOT be in clean_df (no imputation)
    assert "touches_dependencies" not in clean_df.columns
    assert "touches_ci_config" not in clean_df.columns
    assert "queue_depth_at_start" not in clean_df.columns

    # Post-run forbidden fields must be dropped
    assert "duration" not in clean_df.columns
    assert "status" not in clean_df.columns
    assert "commit_sha" not in clean_df.columns

    # Check time ordering
    assert clean_df["started_at"].is_monotonic_increasing


def test_evaluate_realdata_runs_pipeline_and_gate(tmp_path):
    csv_file = tmp_path / "real_sample.csv"
    _make_sample_csv(csv_file, n_rows=400)

    clean_df, metadata = load_realdata(csv_file)
    settings = Settings.from_env()

    report = evaluate_realdata(clean_df, settings, candidate="hist_gb", seed=42)

    assert report["dataset_name"] == metadata["dataset_name"]
    assert report["candidate"] == "hist_gb"
    assert report["n_train"] > 0
    assert report["n_test"] > 0

    # Metrics calculated for baselines and candidate
    for m in ("majority", "logreg", "candidate"):
        assert m in report["metrics"]
        assert isinstance(report["metrics"][m]["pr_auc"], float)
        assert isinstance(report["metrics"][m]["brier"], float)

    # Gate decision structure
    gate = report["gate"]
    assert "passed" in gate
    assert "checks" in gate
    leakage_check = next((c for c in gate["checks"] if c["name"] == "leakage_contract"), None)
    assert leakage_check is not None
    assert leakage_check["passed"] is True  # No forbidden fields


def test_realdata_api_and_cli_persistence(client, tmp_path):
    # Before running, GET /api/reports/realdata returns 404
    get_res = client.get("/api/reports/realdata")
    assert get_res.status_code == 404

    csv_file = tmp_path / "real_sample.csv"
    _make_sample_csv(csv_file, n_rows=400)

    settings = Settings.from_env()
    with client.app.state.db.session() as session:
        record = run_and_save_realdata(session, settings, str(csv_file), candidate="hist_gb")
        assert record.id is not None
        assert record.total_rows == 400

    # Now GET returns 200
    res = client.get("/api/reports/realdata")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == record.id
    assert data["dataset_name"] == record.dataset_name
    assert "missing_contract_features" in data
    assert len(data["missing_contract_features"]) == 3
