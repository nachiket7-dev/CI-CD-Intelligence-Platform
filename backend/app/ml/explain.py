"""Per-run signals by occlusion: what would the risk be if this feature were typical?

For each feature, swap the run's value for the training reference value (median or most common
category) and measure how the failure probability moves. A positive effect means the feature pushed
the risk up. These are signals about the MODEL, not proven causes of a failure.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..contract import FEATURE_COLUMNS


def _plain(value: Any) -> Any:
    return value.item() if hasattr(value, "item") else value


def top_signals(
    model: Any, row: pd.DataFrame, reference: dict[str, Any], k: int = 4
) -> tuple[float, list[dict[str, Any]]]:
    """Return (probability, top-k signals) for a single-row feature frame."""
    base_row = row.iloc[0]
    variants = [base_row.to_dict()]
    for col in FEATURE_COLUMNS:
        swapped = base_row.to_dict()
        swapped[col] = reference[col]
        variants.append(swapped)
    frame = pd.DataFrame(variants, columns=FEATURE_COLUMNS)
    for col in row.columns:
        frame[col] = frame[col].astype(row[col].dtype)
    probs = model.predict_proba(frame)[:, 1]
    p = float(probs[0])
    signals = [
        {
            "feature": col,
            "value": _plain(base_row[col]),
            "typical": _plain(reference[col]),
            "effect": float(p - probs[i + 1]),
        }
        for i, col in enumerate(FEATURE_COLUMNS)
    ]
    signals.sort(key=lambda s: abs(s["effect"]), reverse=True)
    return p, signals[:k]
