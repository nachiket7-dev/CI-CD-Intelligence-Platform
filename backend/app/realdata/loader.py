"""Loader for the public GitHub Actions CI/CD failure dataset (doi: 10.17632/mggwn7rj9f.1).

Maps only columns known before run start onto the platform's feature contract.
All post-run fields, non-contract fields and hashes are dropped.
Unbuildable contract features are NOT imputed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

DATASET_NAME = "Mendeley Data: GitHub Actions CI/CD failure dataset (GADFPD)"
DATASET_DOI = "10.17632/mggwn7rj9f.1"
DATASET_LICENCE = "CC BY 4.0"

UNBUILDABLE_CONTRACT_FEATURES = [
    {
        "feature": "touches_dependencies",
        "reason": "Commit churn is recorded, but not individual file paths or diffs.",
    },
    {
        "feature": "touches_ci_config",
        "reason": "Changes to .github/workflows/* are not flagged in commit metadata.",
    },
    {
        "feature": "queue_depth_at_start",
        "reason": "Runner queue depth at start instant is not available in the dataset.",
    },
]

AVAILABLE_CONTRACT_FEATURES = [
    "repo",
    "workflow_name",
    "trigger_type",
    "files_changed",
    "lines_changed",
    "workflow_fail_rate_recent",
    "hours_since_last_failure",
    "author_recent_fail_rate",
    "hour_of_day",
    "day_of_week",
]

DROPPED_COLUMNS = [
    "duration",
    "status",
    "commit_sha",
    "head_sha",
    "node_id",
    "message",
    "msg_len",
    "is_merge",
    "num_parents",
    "additions",
    "deletions",
    "author_name",
    "author_email",
    "committer_name",
    "committer_email",
    "triggering_actor_login",
    "time_since_last_commit",
    "timestamp_raw",
    "commit_date",
    "timestamp",
    "run_attempt",
    "run_number",
    "head_branch",
]


def load_realdata(
    path: str | Path,
    max_rows: int | None = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Load and sanitize the Mendeley real-world CI/CD dataset from CSV.

    Returns a clean time-ordered DataFrame with only pre-run columns plus outcomes,
    along with dataset metadata and unbuildable feature limits.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Real data CSV not found at: {file_path}")

    # Read CSV
    df = pd.read_csv(file_path, nrows=max_rows, low_memory=False)

    # 1. Map repository
    if "repo" in df.columns:
        repo_col = df["repo"].astype(str)
    elif "repo_name" in df.columns:
        repo_col = df["repo_name"].astype(str)
    else:
        raise ValueError("CSV missing 'repo' or 'repo_name' column.")

    # 2. Map workflow identifier
    if "workflow_id" in df.columns:
        wf_col = df["workflow_id"].fillna(0).astype(str)
    elif "workflow_name" in df.columns:
        wf_col = df["workflow_name"].astype(str)
    else:
        wf_col = pd.Series(["workflow-default"] * len(df))

    # 3. Map trigger event
    if "event" in df.columns:
        trigger_col = df["event"].fillna("push").astype(str).str.lower()
    elif "trigger_type" in df.columns:
        trigger_col = df["trigger_type"].fillna("push").astype(str).str.lower()
    else:
        trigger_col = pd.Series(["push"] * len(df))

    # 4. Map author/actor
    if "actor_login" in df.columns:
        author_col = df["actor_login"].fillna("unknown").astype(str)
    elif "author" in df.columns:
        author_col = df["author"].fillna("unknown").astype(str)
    elif "author_name" in df.columns:
        author_col = df["author_name"].fillna("unknown").astype(str)
    else:
        author_col = pd.Series(["unknown"] * len(df))

    # 5. Map commit change size (files_changed and lines_changed)
    if "files_modified" in df.columns:
        files_col = pd.to_numeric(df["files_modified"], errors="coerce").fillna(1).clip(lower=0).astype(int)
    elif "files_changed" in df.columns:
        files_col = pd.to_numeric(df["files_changed"], errors="coerce").fillna(1).clip(lower=0).astype(int)
    else:
        files_col = pd.Series([1] * len(df), dtype=int)

    if "total_churn" in df.columns:
        lines_col = pd.to_numeric(df["total_churn"], errors="coerce").fillna(0).clip(lower=0).astype(int)
    elif "lines_changed" in df.columns:
        lines_col = pd.to_numeric(df["lines_changed"], errors="coerce").fillna(0).clip(lower=0).astype(int)
    elif "additions" in df.columns and "deletions" in df.columns:
        lines_col = (
            (
                pd.to_numeric(df["additions"], errors="coerce").fillna(0)
                + pd.to_numeric(df["deletions"], errors="coerce").fillna(0)
            )
            .clip(lower=0)
            .astype(int)
        )
    else:
        lines_col = pd.Series([0] * len(df), dtype=int)

    # 6. Map timestamps
    if "run_started_at" in df.columns:
        started_at = pd.to_datetime(df["run_started_at"], errors="coerce", utc=True)
    elif "created_at" in df.columns:
        started_at = pd.to_datetime(df["created_at"], errors="coerce", utc=True)
    elif "started_at" in df.columns:
        started_at = pd.to_datetime(df["started_at"], errors="coerce", utc=True)
    else:
        raise ValueError("CSV missing timestamp column ('run_started_at', 'created_at', or 'started_at').")

    if "updated_at" in df.columns:
        finished_at = pd.to_datetime(df["updated_at"], errors="coerce", utc=True)
    elif "finished_at" in df.columns:
        finished_at = pd.to_datetime(df["finished_at"], errors="coerce", utc=True)
    else:
        # Fallback using duration if present
        if "duration" in df.columns:
            dur_s = pd.to_numeric(df["duration"], errors="coerce").fillna(60)
            finished_at = started_at + pd.to_timedelta(dur_s, unit="s")
        else:
            finished_at = started_at + pd.to_timedelta(60, unit="s")

    # 7. Map outcome: failed (bool)
    if "conclusion" in df.columns:
        failed_col = df["conclusion"].astype(str).str.lower().str.strip() != "success"
    elif "failed" in df.columns:
        failed_col = df["failed"].astype(bool)
    elif "status" in df.columns:
        failed_col = df["status"].astype(str).str.lower().str.strip() != "success"
    else:
        raise ValueError("CSV missing outcome column ('conclusion', 'status', or 'failed').")

    # Build clean frame with ONLY pre-run fields and outcome columns
    clean = pd.DataFrame(
        {
            "repo": repo_col,
            "workflow_name": wf_col,
            "trigger_type": trigger_col,
            "author": author_col,
            "files_changed": files_col,
            "lines_changed": lines_col,
            "started_at": started_at.dt.tz_localize(None),
            "finished_at": finished_at.dt.tz_localize(None),
            "failed": failed_col,
        }
    )

    # Drop invalid rows and sort time-ordered
    clean = clean.dropna(subset=["started_at", "finished_at", "failed"]).copy()
    clean = clean[clean["finished_at"] >= clean["started_at"]].copy()
    clean = clean.sort_values("started_at", kind="mergesort").reset_index(drop=True)

    metadata: dict[str, Any] = {
        "dataset_name": DATASET_NAME,
        "doi": DATASET_DOI,
        "licence": DATASET_LICENCE,
        "total_rows": len(clean),
        "repos": sorted(clean["repo"].unique().tolist()),
        "failure_rate": round(float(clean["failed"].mean()), 4),
        "available_features": AVAILABLE_CONTRACT_FEATURES,
        "missing_contract_features": UNBUILDABLE_CONTRACT_FEATURES,
        "dropped_columns": DROPPED_COLUMNS,
    }

    return clean, metadata
