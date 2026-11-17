from app.ml.gate import evaluate_gate
from app.ml.pipeline import run_experiment


def _metrics(candidate_pr: float, candidate_brier: float = 0.14):
    base = {"pr_auc": 0.30, "brier": 0.15}
    return {
        "majority": {"pr_auc": 0.18, "brier": 0.16},
        "logreg": base,
        "candidate": {"pr_auc": candidate_pr, "brier": candidate_brier},
    }


def test_gate_passes_a_clear_improvement():
    assert evaluate_gate(_metrics(0.34), [], margin=0.01, brier_tolerance=0.002).passed


def test_gate_rejects_an_improvement_below_the_margin():
    decision = evaluate_gate(_metrics(0.305), [], margin=0.01, brier_tolerance=0.002)
    assert not decision.passed
    assert [c.name for c in decision.checks if not c.passed] == ["beats_baseline_pr_auc"]


def test_gate_rejects_worse_calibration():
    assert not evaluate_gate(_metrics(0.40, 0.20), [], margin=0.01, brier_tolerance=0.002).passed


def test_gate_blocks_on_a_contract_violation():
    decision = evaluate_gate(
        _metrics(0.40), ["'duration_s' is only known after the run"], margin=0.01, brier_tolerance=0.002
    )
    assert not decision.passed


def test_a_deliberately_weak_model_is_rejected(frame):
    exp = run_experiment(frame, seed=1, candidate_kind="weak_stump", gate_margin=0.01)
    assert exp.gate.passed is False


def test_experiment_is_reproducible(frame):
    a = run_experiment(frame, seed=5, candidate_kind="hist_gb")
    b = run_experiment(frame, seed=5, candidate_kind="hist_gb")
    assert a.metrics == b.metrics
