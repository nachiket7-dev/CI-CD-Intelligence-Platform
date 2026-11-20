# Public Real-World CI/CD Dataset Loader

This package integrates the public GitHub Actions CI/CD failure dataset into the intelligence platform for an independent real-world generalisation check.

## Dataset Information

- **Dataset Title**: A comprehensive GitHub Actions dataset for CI/CD pipeline failure forecasting (GADFPD)
- **DOI**: [10.17632/mggwn7rj9f.1](https://doi.org/10.17632/mggwn7rj9f.1)
- **Authors**: Joshua Faruna and Funmilayo Sanusi (Babcock University)
- **Date Published**: June 2026 (Mendeley Data)
- **Licence**: Creative Commons Attribution 4.0 International (**CC BY 4.0**)
- **Scope**: 303,079 unique CI/CD workflow executions (2016–2026) across 34 active open-source GitHub repositories.
- **Source File**: `final_research_dataset_MASTER.csv` (38 columns)

---

## Column Mapping to the Feature Contract

The loader enforces the platform's strict feature contract: **only information known before a run starts may become a model input**. Post-run fields and uncontracted columns are discarded.

| Raw Dataset Column | Mapped Field | Known At | Role / Description |
|---|---|---|---|
| `repo` / `repo_name` | `repo` | Run start | Repository name (categorical feature) |
| `workflow_id` | `workflow_name` | Run start | Workflow identifier (categorical feature) |
| `event` | `trigger_type` | Run start | Trigger event, e.g. `push`, `pull_request` (categorical feature) |
| `actor_login` | `author` | Run start | Actor triggering the run (used for rolling author fail rate) |
| `files_modified` | `files_changed` | Run start | Number of files in the commit (numeric feature) |
| `total_churn` | `lines_changed` | Run start | Combined insertions + deletions in commit (numeric feature) |
| `run_started_at` | `started_at` | Run start | Start timestamp (used for time-ordering and hour/day features) |
| `conclusion` | `failed` | Run finish | Ground-truth outcome: `True` if `conclusion != 'success'` |
| `updated_at` | `finished_at` | Run finish | End timestamp: strictly used for rolling history boundaries |

---

## Dropped Columns (Excluded for Leakage Prevention or Relevance)

The following 29 columns from the raw CSV are explicitly dropped:
- `duration`: Post-run measurement in seconds (strictly forbidden as a feature by `contract.py`).
- `status`: Execution status (post-run; redundant with `conclusion`).
- `commit_sha`, `head_sha`, `node_id`: Git commit SHAs and GraphQL node IDs (not in contract).
- `message`, `msg_len`: Commit message text and length (outside contract scope).
- `is_merge`, `num_parents`: Commit topology flags (outside contract scope).
- `additions`, `deletions`: Redundant components of `total_churn`.
- `author_name`, `author_email`, `committer_name`, `committer_email`, `triggering_actor_login`: Redundant with normalized `actor_login`.
- `time_since_last_commit`, `timestamp_raw`, `commit_date`, `timestamp`: Redundant with `run_started_at`.
- `run_attempt`: Post-run execution attempt count (forbidden as a pre-run feature).
- `run_number`: Sequential run index (outside contract scope).
- `head_branch`: Git branch name (outside contract scope).

---

## Contract Features Not Buildable From This Dataset (Not Imputed)

The feature contract defines 13 features. Three cannot be constructed from the dataset's commit-level metadata:

1. `touches_dependencies`: The dataset records file counts and churn, but not file paths or diffs. Whether dependency files (`package.json`, `requirements.txt`, etc.) were modified cannot be determined.
2. `touches_ci_config`: Modification of workflow configuration files (`.github/workflows/*`) is not flagged in the dataset.
3. `queue_depth_at_start`: Runner queue depths at the start instant were not logged in GitHub Actions commit metadata.

**Policy: Do Not Impute**. In accordance with platform guidelines, unbuildable features are never filled with artificial constants (such as 0 or median). Instead, the model is trained and evaluated on the exact subset of features verifiable from the real environment, and the missing features are transparently documented in the UI and CLI reports.

---

## Pipeline Execution & Isolation

- **Time-Ordered Split**: Training strictly precedes validation, which strictly precedes testing (`ml/split.py`).
- **Isolation**: Real-world data rows are never mixed with synthetic simulator rows.
- **Promotion Gate**: The candidate model trained on real data must beat the majority baseline and logistic regression on the real test split under the same gate rules.
