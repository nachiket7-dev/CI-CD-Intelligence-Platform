"""Leakage-safe feature builder.

``build_features(targets, history)`` scores the rows in ``targets`` using only:

1. the pre-run columns of each target row (``contract.PRE_RUN_COLUMNS``), and
2. runs in ``history`` that had ALREADY FINISHED when the target run started.

The builder selects the pre-run columns explicitly, so hidden columns (outcome, duration) of a
target run cannot be read even if they are present in the frame. Training passes the same frame as
targets and history; serving passes one pending run and the finished runs from the database.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..contract import FEATURE_COLUMNS, PRE_RUN_COLUMNS

DEFAULT_WINDOW = 20
SMOOTHING = 2.0  # pseudo-runs at the prior rate, so a tiny history never gives a 0% or 100% rate
HOURS_CAP = 168.0  # one week
DEFAULT_PRIOR = 0.15  # fixed on purpose: a prior learned from the data would leak the future


def _seconds(series: pd.Series) -> np.ndarray:
    return series.to_numpy(dtype="datetime64[s]").astype("int64")


def _rolling_rate(
    targets: pd.DataFrame,
    history: pd.DataFrame,
    keys: list[str],
    window: int,
    prior: float,
) -> np.ndarray:
    """Smoothed failure rate over the last ``window`` runs that finished before each target started."""
    out = np.full(len(targets), prior, dtype=float)
    if history.empty:
        return out
    hist_groups = {k: g.sort_values("finished_at") for k, g in history.groupby(keys, sort=False)}
    for key, group in targets.groupby(keys, sort=False):
        hist = hist_groups.get(key)
        if hist is None:
            continue
        finished = _seconds(hist["finished_at"])
        failed_cum = np.concatenate([[0], np.cumsum(hist["failed"].to_numpy(dtype=int))])
        idx_rows = targets.index.get_indexer(group.index)
        starts = _seconds(group["started_at"])
        n_done = np.searchsorted(finished, starts, side="right")  # finished at or before start
        lo = np.maximum(0, n_done - window)
        fails = failed_cum[n_done] - failed_cum[lo]
        total = n_done - lo
        out[idx_rows] = (fails + prior * SMOOTHING) / (total + SMOOTHING)
    return out


def _hours_since_last_failure(targets: pd.DataFrame, history: pd.DataFrame) -> np.ndarray:
    out = np.full(len(targets), HOURS_CAP, dtype=float)
    failed_hist = history[history["failed"]]
    if failed_hist.empty:
        return out
    groups = {
        k: np.sort(_seconds(g["finished_at"]))
        for k, g in failed_hist.groupby(["repo", "workflow_name"], sort=False)
    }
    for key, group in targets.groupby(["repo", "workflow_name"], sort=False):
        times = groups.get(key)
        if times is None:
            continue
        idx_rows = targets.index.get_indexer(group.index)
        starts = _seconds(group["started_at"])
        j = np.searchsorted(times, starts, side="right")
        hours = np.where(j > 0, (starts - times[np.maximum(j - 1, 0)]) / 3600.0, HOURS_CAP)
        out[idx_rows] = np.minimum(hours, HOURS_CAP)
    return out


def build_features(
    targets: pd.DataFrame,
    history: pd.DataFrame,
    *,
    window: int = DEFAULT_WINDOW,
    prior_rate: float | None = None,
) -> pd.DataFrame:
    """Return one row of contract features per target row, in the same order."""
    t = targets[PRE_RUN_COLUMNS].copy()  # never touches outcome or duration columns of a target
    hist = history[["repo", "workflow_name", "author", "finished_at", "failed"]]
    prior = DEFAULT_PRIOR if prior_rate is None else prior_rate

    feats = t.drop(columns=["author", "started_at"]).copy()
    feats["workflow_fail_rate_recent"] = _rolling_rate(t, hist, ["repo", "workflow_name"], window, prior)
    feats["hours_since_last_failure"] = _hours_since_last_failure(t, hist)
    feats["author_recent_fail_rate"] = _rolling_rate(t, hist, ["repo", "author"], window, prior)
    started = pd.to_datetime(t["started_at"])
    feats["hour_of_day"] = started.dt.hour
    feats["day_of_week"] = started.dt.dayofweek
    return feats[FEATURE_COLUMNS]
