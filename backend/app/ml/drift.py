"""Drift measurement using Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) tests."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import ks_2samp


def calculate_psi(
    reference: np.ndarray | list[float],
    live: np.ndarray | list[float],
    bins: int = 10,
    epsilon: float = 1e-4,
) -> float:
    """Calculate the Population Stability Index (PSI) between reference and live samples."""
    ref = np.asarray(reference, dtype=float)
    liv = np.asarray(live, dtype=float)

    ref = ref[~np.isnan(ref)]
    liv = liv[~np.isnan(liv)]

    if len(ref) == 0 or len(liv) == 0:
        return 0.0

    unique_vals = np.unique(ref)
    if len(unique_vals) <= bins:
        all_vals = np.union1d(unique_vals, np.unique(liv))
        ref_counts = np.array([np.sum(ref == v) for v in all_vals], dtype=float)
        liv_counts = np.array([np.sum(liv == v) for v in all_vals], dtype=float)

        ref_pct = np.maximum(ref_counts / len(ref), epsilon)
        liv_pct = np.maximum(liv_counts / len(liv), epsilon)
        ref_pct = ref_pct / np.sum(ref_pct)
        liv_pct = liv_pct / np.sum(liv_pct)

        psi = float(np.sum((liv_pct - ref_pct) * np.log(liv_pct / ref_pct)))
        return max(0.0, float(np.round(psi, 4)))

    percentiles = np.linspace(0, 100, bins + 1)
    bin_edges = np.percentile(ref, percentiles)
    bin_edges = np.unique(bin_edges)
    if len(bin_edges) < 2:
        return 0.0

    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf

    ref_counts, _ = np.histogram(ref, bins=bin_edges)
    liv_counts, _ = np.histogram(liv, bins=bin_edges)

    ref_pct = np.maximum(ref_counts / len(ref), epsilon)
    liv_pct = np.maximum(liv_counts / len(liv), epsilon)
    ref_pct = ref_pct / np.sum(ref_pct)
    liv_pct = liv_pct / np.sum(liv_pct)

    psi = float(np.sum((liv_pct - ref_pct) * np.log(liv_pct / ref_pct)))
    return max(0.0, float(np.round(psi, 4)))


def calculate_ks(
    reference: np.ndarray | list[float],
    live: np.ndarray | list[float],
) -> tuple[float, float]:
    """Calculate the two-sample Kolmogorov-Smirnov test statistic and p-value."""
    ref = np.asarray(reference, dtype=float)
    liv = np.asarray(live, dtype=float)
    ref = ref[~np.isnan(ref)]
    liv = liv[~np.isnan(liv)]

    if len(ref) == 0 or len(liv) == 0:
        return 0.0, 1.0

    res = ks_2samp(ref, liv)
    return float(np.round(res.statistic, 4)), float(np.round(res.pvalue, 6))


def category_shares(
    ref_series: pd.Series,
    live_series: pd.Series,
    epsilon: float = 1e-4,
) -> tuple[float, list[dict[str, Any]]]:
    """Calculate category shares, delta, and categorical PSI between reference and live series."""
    ref_counts = ref_series.value_counts()
    liv_counts = live_series.value_counts()
    all_cats = sorted(set(ref_counts.index).union(set(liv_counts.index)))

    n_ref = len(ref_series)
    n_liv = len(live_series)

    shares: list[dict[str, Any]] = []
    ref_shares: list[float] = []
    liv_shares: list[float] = []

    for cat in all_cats:
        c_ref = int(ref_counts.get(cat, 0))
        c_liv = int(liv_counts.get(cat, 0))
        p_ref = c_ref / n_ref if n_ref > 0 else 0.0
        p_liv = c_liv / n_liv if n_liv > 0 else 0.0
        shares.append(
            {
                "category": str(cat),
                "reference_count": c_ref,
                "reference_share": float(np.round(p_ref, 4)),
                "live_count": c_liv,
                "live_share": float(np.round(p_liv, 4)),
                "delta": float(np.round(p_liv - p_ref, 4)),
            }
        )
        ref_shares.append(max(p_ref, epsilon))
        liv_shares.append(max(p_liv, epsilon))

    ref_arr = np.array(ref_shares, dtype=float)
    liv_arr = np.array(liv_shares, dtype=float)
    ref_arr = ref_arr / np.sum(ref_arr)
    liv_arr = liv_arr / np.sum(liv_arr)

    psi = float(np.sum((liv_arr - ref_arr) * np.log(liv_arr / ref_arr)))
    return max(0.0, float(np.round(psi, 4))), shares


def classify_psi(psi: float) -> tuple[str, str]:
    """Classify PSI into plain-language status (stable, watch, shifted) with actionable advice."""
    if psi < 0.1:
        return "stable", "Distribution matches training. No action needed."
    elif psi < 0.2:
        return "watch", "Moderate shift detected. Monitor failure rate and model predictions closely."
    else:
        return (
            "shifted",
            "Significant shift. Retrain the model on recent data or check CI environment changes.",
        )
