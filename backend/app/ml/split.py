"""Time-ordered split. The future never leaks into training."""

from __future__ import annotations

import pandas as pd


def time_split(
    frame: pd.DataFrame,
    fractions: tuple[float, float, float] = (0.6, 0.2, 0.2),
    time_col: str = "started_at",
) -> tuple[pd.Index, pd.Index, pd.Index]:
    """Return index labels for (train, validation, test), ordered by ``time_col``.

    Every training run starts no later than every validation run, which starts no later than every
    test run, whatever order the input frame arrives in.
    """
    if abs(sum(fractions) - 1.0) > 1e-9:
        raise ValueError("fractions must sum to 1")
    ordered = frame.sort_values(time_col, kind="mergesort")
    n = len(ordered)
    a = int(n * fractions[0])
    b = int(n * (fractions[0] + fractions[1]))
    return ordered.index[:a], ordered.index[a:b], ordered.index[b:]
