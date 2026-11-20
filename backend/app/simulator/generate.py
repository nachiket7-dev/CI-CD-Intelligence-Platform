"""Seeded CI simulator.

Same seed and same scenarios give an identical dataset. Each scenario is one repository with its own
random stream, so adding a scenario never changes another scenario's runs.

The generator produces both the information known at run start and the hidden outcome. Failure is
a noisy mix of causes, including two non-linear ones (large dependency changes, long queues) and a
latent "bad stretch" per workflow, so a model has something real to learn that a straight line
cannot fully capture. It is still synthetic: results show the pipeline works, not that it
generalises to real repositories.
"""

from __future__ import annotations

import zlib
from collections.abc import Sequence
from datetime import datetime

import numpy as np
import pandas as pd

from .scenarios import Scenario

SIM_EPOCH = datetime(2026, 1, 5, 8, 0, 0)  # fixed, so datasets never depend on today's date
TRIGGERS = ("push", "pull_request", "schedule")
TRIGGER_P = (0.45, 0.45, 0.10)

HIDDEN_COLUMNS = ["failed", "duration_s"]


def _logit(p: float) -> float:
    return float(np.log(p / (1 - p)))


def _scenario_rng(seed: int, name: str, stream: int) -> np.random.Generator:
    return np.random.default_rng(np.random.SeedSequence([seed, zlib.crc32(name.encode()), stream]))


def simulate_scenario(
    scenario: Scenario,
    n_runs: int,
    seed: int,
    *,
    start_after: datetime | None = None,
    stream: int = 0,
    drift: bool = False,
    drift_queue_boost: float = 0.0,
) -> pd.DataFrame:
    """Simulate one repository. ``stream`` lets callers continue a timeline with fresh randomness."""
    rng = _scenario_rng(seed, scenario.name, stream)
    eff = scenario.effects
    wf = scenario.workflows
    t0 = start_after or SIM_EPOCH

    gaps = rng.exponential(scenario.inter_arrival_min, n_runs)
    started = pd.to_datetime(t0) + pd.to_timedelta(np.cumsum(gaps), unit="m")
    started = started.floor("s")
    hours = started.hour.to_numpy()
    weekday = started.dayofweek.to_numpy()
    peak = ((hours >= 9) & (hours <= 17) & (weekday < 5)).astype(float)

    weights = np.array([w.weight for w in wf], dtype=float)
    wf_idx = rng.choice(len(wf), size=n_runs, p=weights / weights.sum())
    trigger = rng.choice(TRIGGERS, size=n_runs, p=TRIGGER_P)
    author_idx = rng.integers(0, scenario.authors, n_runs)
    files = np.maximum(1, rng.lognormal(1.1, 0.9, n_runs).astype(int))
    lines = np.maximum(1, (files * rng.lognormal(3.0, 0.8, n_runs)).astype(int))
    deps = (rng.random(n_runs) < scenario.p_dependencies).astype(int)
    ci_cfg = (rng.random(n_runs) < scenario.p_ci_config).astype(int)
    queue_boost = drift_queue_boost if drift_queue_boost > 0 else (15.0 if drift else 0.0)
    queue = rng.poisson(scenario.base_queue * (1 + 1.5 * peak) + queue_boost)

    author_effect = rng.normal(0.0, eff["author_spread"], scenario.authors)
    noise = rng.normal(0.0, scenario.noise, n_runs)
    fail_draw = rng.random(n_runs)
    state_draw = rng.random(n_runs)
    dur_noise = rng.lognormal(0.0, 0.25, n_runs)
    dur_fail_scale = rng.uniform(0.5, 1.5, n_runs)

    base_logit = _logit(scenario.base_fail_rate)
    broken_state = np.zeros(len(wf), dtype=bool)  # latent: is each workflow in a bad stretch?
    failed = np.zeros(n_runs, dtype=bool)
    duration = np.zeros(n_runs)

    for i in range(n_runs):
        w = wf_idx[i]
        if broken_state[w]:
            broken_state[w] = state_draw[i] >= scenario.broken["p_off"]
        else:
            broken_state[w] = state_draw[i] < scenario.broken["p_on"]

        large = lines[i] > 150
        z = (
            base_logit
            + eff["dependencies"] * deps[i]
            + eff["ci_config"] * ci_cfg[i]
            + eff["size"] * (np.log1p(lines[i]) - 4.0) / 1.5
            + eff["dependencies_x_large"] * deps[i] * large
            + eff["queue_over_threshold"] * max(0.0, queue[i] - eff["queue_threshold"]) / 4.0
            + eff["peak_hours"] * peak[i]
            + eff.get("ci_config_x_flaky", 0.0) * ci_cfg[i] * (wf[w].flakiness > 0.5)
            + eff.get("peak_x_busy", 0.0) * peak[i] * (queue[i] > eff["queue_threshold"])
            + author_effect[author_idx[i]]
            + wf[w].flakiness
            + eff["broken_state"] * broken_state[w]
            + scenario.drift_per_1000_runs * (i / 1000.0)
            + noise[i]
        )
        p_fail = 1.0 / (1.0 + np.exp(-z))
        failed[i] = fail_draw[i] < p_fail

        secs = wf[w].base_seconds * (1 + np.log1p(lines[i]) / 8.0) * dur_noise[i]
        duration[i] = max(20.0, secs * (dur_fail_scale[i] if failed[i] else 1.0))

    frame = pd.DataFrame(
        {
            "repo": scenario.name,
            "workflow_name": [wf[k].name for k in wf_idx],
            "trigger_type": trigger,
            "author": [f"dev-{k:02d}" for k in author_idx],
            "files_changed": files,
            "lines_changed": lines,
            "touches_dependencies": deps,
            "touches_ci_config": ci_cfg,
            "queue_depth_at_start": queue,
            "started_at": started,
            "failed": failed,
            "duration_s": duration.round(1),
        }
    )
    return frame


def simulate(
    scenarios: Sequence[Scenario],
    n_runs: int,
    seed: int,
    *,
    start_after: datetime | None = None,
    stream: int = 0,
    drift: bool = False,
    drift_queue_boost: float = 0.0,
) -> pd.DataFrame:
    """Simulate several repositories and merge them into one time-ordered dataset."""
    frames = [
        simulate_scenario(
            s,
            n_runs,
            seed,
            start_after=start_after,
            stream=stream,
            drift=drift,
            drift_queue_boost=drift_queue_boost,
        )
        for s in sorted(scenarios, key=lambda s: s.name)
    ]
    merged = pd.concat(frames, ignore_index=True)
    merged = merged.sort_values(["started_at", "repo"], kind="mergesort").reset_index(drop=True)
    merged["finished_at"] = merged["started_at"] + pd.to_timedelta(merged["duration_s"], unit="s")
    return merged


def pre_run_view(frame: pd.DataFrame) -> pd.DataFrame:
    """The part of a simulated run that is knowable when the run starts."""
    from ..contract import PRE_RUN_COLUMNS

    return frame[PRE_RUN_COLUMNS].copy()
