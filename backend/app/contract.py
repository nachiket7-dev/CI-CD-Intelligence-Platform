"""The feature contract.

Only information known BEFORE a run finishes may become a model input. This module is the single
written source of truth for that rule, and the tests enforce it:

* ``FEATURES`` lists every allowed model input and when it becomes known.
* ``FORBIDDEN_FIELDS`` lists fields that exist only during or after a run.
* ``PRE_RUN_COLUMNS`` is the only part of a run the feature builder may read.

Adding a feature means adding it here first, with its definition.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass


class ContractViolation(ValueError):
    """Raised when a payload or feature set uses information from after the run started."""


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    kind: str  # "categorical" | "numeric"
    known_at: str
    description: str


FEATURES: tuple[FeatureSpec, ...] = (
    FeatureSpec("repo", "categorical", "run start", "Repository the run belongs to."),
    FeatureSpec("workflow_name", "categorical", "run start", "Which pipeline is running."),
    FeatureSpec("trigger_type", "categorical", "run start", "push, pull_request or schedule."),
    FeatureSpec("files_changed", "numeric", "run start", "Number of files in the change."),
    FeatureSpec("lines_changed", "numeric", "run start", "Lines added plus removed."),
    FeatureSpec("touches_dependencies", "numeric", "run start", "1 if a dependency file changed."),
    FeatureSpec("touches_ci_config", "numeric", "run start", "1 if CI configuration changed."),
    FeatureSpec("queue_depth_at_start", "numeric", "run start", "Jobs waiting when the run began."),
    FeatureSpec(
        "workflow_fail_rate_recent",
        "numeric",
        "run start",
        "Smoothed failure rate of the last N runs of this workflow that had already FINISHED.",
    ),
    FeatureSpec(
        "hours_since_last_failure",
        "numeric",
        "run start",
        "Hours since this workflow last finished in failure (capped).",
    ),
    FeatureSpec(
        "author_recent_fail_rate",
        "numeric",
        "run start",
        "Smoothed failure rate of the author's last N finished runs in this repo.",
    ),
    FeatureSpec("hour_of_day", "numeric", "run start", "Hour the run started (0-23)."),
    FeatureSpec("day_of_week", "numeric", "run start", "Day the run started (0 = Monday)."),
)

FEATURE_COLUMNS: list[str] = [f.name for f in FEATURES]
CATEGORICAL_FEATURES: list[str] = [f.name for f in FEATURES if f.kind == "categorical"]
NUMERIC_FEATURES: list[str] = [f.name for f in FEATURES if f.kind == "numeric"]

# Fields that exist only during or after a run. Never inputs, never accepted by the predict API.
FORBIDDEN_FIELDS: frozenset[str] = frozenset(
    {
        "failed",
        "result",
        "outcome",
        "duration_s",
        "finished_at",
        "exit_code",
        "failed_tests",
        "step_results",
        "log_text",
        "retry_count",
    }
)

# The only run fields the feature builder may read for the run it is scoring.
PRE_RUN_COLUMNS: list[str] = [
    "repo",
    "workflow_name",
    "trigger_type",
    "author",
    "files_changed",
    "lines_changed",
    "touches_dependencies",
    "touches_ci_config",
    "queue_depth_at_start",
    "started_at",
]


def check_columns(columns: Iterable[str]) -> list[str]:
    """Return a list of violations (empty means the columns satisfy the contract)."""
    problems: list[str] = []
    allowed = set(FEATURE_COLUMNS)
    for col in columns:
        if col in FORBIDDEN_FIELDS:
            problems.append(f"'{col}' is only known after the run (forbidden)")
        elif col not in allowed:
            problems.append(f"'{col}' is not listed in the feature contract")
    return problems


def validate_payload(payload: Mapping[str, object]) -> None:
    """Reject a request that carries post-run information."""
    bad = sorted(set(payload) & FORBIDDEN_FIELDS)
    if bad:
        raise ContractViolation(
            "These fields are only known after a run finishes and cannot be sent: " + ", ".join(bad)
        )
