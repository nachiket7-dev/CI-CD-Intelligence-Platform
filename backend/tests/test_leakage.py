"""The future must never reach a feature."""

import numpy as np
import pandas as pd

from app.ml.features import build_features


def test_hidden_columns_of_the_scored_run_are_never_read(frame):
    poisoned = frame.copy()
    rng = np.random.default_rng(0)
    poisoned["failed"] = rng.random(len(poisoned)) < 0.5
    poisoned["duration_s"] = rng.random(len(poisoned)) * 1e6
    # History keeps its true outcomes; only the scored runs' own hidden columns are scrambled.
    clean = build_features(frame, frame)
    scrambled = build_features(poisoned, frame)
    pd.testing.assert_frame_equal(clean, scrambled)


def test_outcomes_that_arrive_later_do_not_change_earlier_features(frame):
    ordered = frame.sort_values("started_at").reset_index(drop=True)
    cut = ordered.loc[int(len(ordered) * 0.6), "started_at"]
    baseline = build_features(ordered, ordered)

    future = ordered["finished_at"] >= cut  # runs not yet finished when the cut-off run starts
    mutated = ordered.copy()
    mutated.loc[future, "failed"] = ~mutated.loc[future, "failed"]
    after = build_features(mutated, mutated)

    before_cut = ordered["started_at"] <= cut
    pd.testing.assert_frame_equal(baseline[before_cut], after[before_cut])


def test_a_run_never_sees_its_own_outcome(frame):
    ordered = frame.sort_values("started_at").reset_index(drop=True)
    flipped = ordered.copy()
    flipped["failed"] = ~flipped["failed"]
    own = build_features(ordered, ordered)["workflow_fail_rate_recent"].iloc[:1]
    other = build_features(flipped, flipped)["workflow_fail_rate_recent"].iloc[:1]
    # The very first run has no finished history, so its rolling rate is the fixed prior either way.
    assert own.iloc[0] == other.iloc[0]
