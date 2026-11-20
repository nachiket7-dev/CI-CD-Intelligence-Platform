"""Tests for optional MLflow tracking."""

import sys
from unittest.mock import MagicMock, patch

from app.config import Settings
from app.ml.tracking import log_model_training


def test_mlflow_disabled_by_default():
    """By default, enable_mlflow is False and log_model_training returns None without touching mlflow."""
    settings = Settings()
    assert not settings.enable_mlflow

    result = log_model_training(
        settings,
        version="v001-hist_gb",
        algo="hist_gb",
        seed=42,
        metrics={"candidate": {"pr_auc": 0.35, "brier": 0.14}},
        gate={"passed": True},
        artifact_path="/tmp/nonexistent.joblib",
        n_train=200,
        n_val=50,
        n_test=50,
    )
    assert result is None


def test_mlflow_tracking_when_enabled(tmp_path):
    """When enable_mlflow is True and mlflow is available, params, metrics and artifact are logged."""
    fake_artifact = tmp_path / "model.joblib"
    fake_artifact.write_text("model-bytes")

    settings = Settings(
        enable_mlflow=True,
        mlflow_tracking_uri=f"file://{tmp_path}/mlruns",
        mlflow_experiment_name="test-exp",
    )

    mock_mlflow = MagicMock()
    mock_run = MagicMock()
    mock_run.info.run_id = "test-run-123"
    mock_mlflow.start_run.return_value.__enter__.return_value = mock_run

    with patch.dict(sys.modules, {"mlflow": mock_mlflow}):
        run_id = log_model_training(
            settings,
            version="v002-hist_gb",
            algo="hist_gb",
            seed=42,
            metrics={
                "candidate": {
                    "pr_auc": 0.358,
                    "brier": 0.142,
                    "brier_uncalibrated": 0.155,
                    "recall_at_precision": 0.22,
                },
                "logreg": {"pr_auc": 0.334, "brier": 0.148},
                "majority": {"pr_auc": 0.191, "brier": 0.155},
            },
            gate={"passed": True},
            artifact_path=str(fake_artifact),
            n_train=600,
            n_val=200,
            n_test=200,
        )

        assert run_id == "test-run-123"
        mock_mlflow.set_tracking_uri.assert_called_once_with(f"file://{tmp_path}/mlruns")
        mock_mlflow.set_experiment.assert_called_once_with("test-exp")
        mock_mlflow.start_run.assert_called_once_with(run_name="v002-hist_gb")

        mock_mlflow.log_params.assert_called_once()
        params = mock_mlflow.log_params.call_args[0][0]
        assert params["version"] == "v002-hist_gb"
        assert params["candidate"] == "hist_gb"
        assert params["n_train"] == 600
        assert params["gate_passed"] is True

        mock_mlflow.log_metrics.assert_called_once()
        metrics = mock_mlflow.log_metrics.call_args[0][0]
        assert metrics["candidate_pr_auc"] == 0.358
        assert metrics["candidate_brier"] == 0.142
        assert metrics["logreg_pr_auc"] == 0.334

        mock_mlflow.log_artifact.assert_called_once_with(str(fake_artifact))


def test_mlflow_enabled_without_library_logs_warning_and_returns_none(caplog):
    """When enabled but mlflow is not installed, it logs a warning and returns None cleanly."""
    settings = Settings(enable_mlflow=True)

    with patch.dict(sys.modules, {"mlflow": None}):
        res = log_model_training(
            settings,
            version="v003-hist_gb",
            algo="hist_gb",
            seed=42,
            metrics={},
            gate={},
            artifact_path="/tmp/model.joblib",
            n_train=10,
            n_val=5,
            n_test=5,
        )
        assert res is None
