from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.services_results import generate_results_report


def test_generate_results_report_fast(tmp_path: Path) -> None:
    settings = Settings.from_env()
    out_file = tmp_path / "RESULTS_TEST.md"

    content = generate_results_report(
        settings=settings,
        seeds=1,
        runs_per_scenario=100,
        candidate="hist_gb",
        output_path=out_file,
    )

    assert out_file.exists()
    assert "# CI/CD Intelligence Platform: Experimental Results" in content
    assert "## Honest Limits and Simulator Assumptions" in content
    assert "## 1. Multi-Seed Evaluation: Baselines vs Candidate" in content
    assert "## 2. Generalisation: Leave-One-Scenario-Out" in content
    assert "## 3. Feature Group Ablation & Deliberate Leakage Verification" in content
    assert "## 4. Real-World Data Check" in content
    assert "## Analysis of the Four Plan Success Measures" in content
    assert "### 1. Beats the Baseline" in content
    assert "### 2. No Leakage" in content
    assert "### 3. Calibrated" in content
    assert "### 4. Works on Real Data (Optional)" in content
    assert "duration_s" in content
    assert "REJECTED" in content
