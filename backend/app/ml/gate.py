"""Promotion gate. A candidate becomes eligible only if it clearly beats the baselines."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class GateCheck:
    name: str
    passed: bool
    detail: str


@dataclass(frozen=True)
class GateDecision:
    passed: bool
    reason: str
    checks: list[GateCheck]

    def to_dict(self) -> dict[str, Any]:
        return {"passed": self.passed, "reason": self.reason, "checks": [asdict(c) for c in self.checks]}


def evaluate_gate(
    metrics: dict[str, dict[str, Any]],
    leakage_violations: list[str],
    *,
    margin: float,
    brier_tolerance: float,
) -> GateDecision:
    """``metrics`` holds test-set scores for ``majority``, ``logreg`` and ``candidate``."""
    cand = metrics["candidate"]
    baselines = {k: v for k, v in metrics.items() if k != "candidate"}
    best_name, best = max(baselines.items(), key=lambda kv: kv[1]["pr_auc"])
    best_brier = min(v["brier"] for v in baselines.values())

    gain = cand["pr_auc"] - best["pr_auc"]
    checks = [
        GateCheck(
            "beats_baseline_pr_auc",
            gain >= margin,
            f"Candidate PR-AUC {cand['pr_auc']:.3f} vs best baseline ({best_name}) "
            f"{best['pr_auc']:.3f}: gain {gain:+.3f}, required {margin:+.3f}.",
        ),
        GateCheck(
            "brier_not_worse",
            cand["brier"] <= best_brier + brier_tolerance,
            f"Candidate Brier {cand['brier']:.4f} vs best baseline {best_brier:.4f} "
            f"(tolerance {brier_tolerance:.4f}).",
        ),
        GateCheck(
            "leakage_contract",
            not leakage_violations,
            "Feature columns satisfy the contract."
            if not leakage_violations
            else "Contract violations: " + "; ".join(leakage_violations),
        ),
    ]
    failed = [c for c in checks if not c.passed]
    reason = "Passed all gate checks." if not failed else "Rejected: " + " ".join(c.detail for c in failed)
    return GateDecision(passed=not failed, reason=reason, checks=checks)
