/**
 * API shapes. These mirror backend/app/schemas.py by hand so the starter has no build step.
 * To generate exact types from the running backend instead: `npm run gen:api`.
 */

export type RunStatus = "pending" | "passed" | "failed";
export type ModelStatus = "candidate" | "active" | "rejected" | "retired";
export type CandidateKind = "hist_gb" | "random_forest" | "weak_stump";

export interface RunCounts {
  total: number;
  pending: number;
  passed: number;
  failed: number;
}

export interface Run {
  id: number;
  repo: string;
  workflow_name: string;
  trigger_type: string;
  author: string;
  files_changed: number;
  lines_changed: number;
  touches_dependencies: boolean;
  touches_ci_config: boolean;
  queue_depth_at_start: number;
  started_at: string;
  status: RunStatus;
  risk: number | null;
  model_version: string | null;
}

export interface RunList {
  items: Run[];
  counts: RunCounts;
  repos: string[];
}

export interface Signal {
  feature: string;
  value: number | string;
  typical: number | string;
  /** Change in failure probability versus a typical value. Positive raises the risk. */
  effect: number;
}

export interface Prediction {
  id: number;
  probability: number;
  model_version: string;
  predicted_at: string;
  signals: Signal[];
  features: Record<string, number | string>;
}

export interface Outcome {
  failed: boolean;
  duration_s: number;
  finished_at: string;
  recorded_at: string;
}

export interface TrailEvent {
  kind: "started" | "scored" | "finished" | "recorded";
  label: string;
  at: string;
  clock: "simulated" | "system";
}

export interface RunDetail extends Run {
  prediction: Prediction | null;
  outcome: Outcome | null;
  trail: TrailEvent[];
  predicted_before_outcome: boolean | null;
}

export interface ModelScores {
  pr_auc: number;
  brier: number;
  prevalence: number;
  recall_at_precision: number | null;
  precision_target: number;
  n: number;
  brier_uncalibrated?: number;
}

export interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface Model {
  id: number;
  version: string;
  algo: string;
  seed: number;
  status: ModelStatus;
  created_at: string;
  n_train: number;
  n_val: number;
  n_test: number;
  metrics: { majority: ModelScores; logreg: ModelScores; candidate: ModelScores };
  gate: { passed: boolean; reason: string; checks: GateCheck[] };
  importances: Record<string, number>;
}

export interface GeneralisationRow {
  scenario: string;
  majority_pr_auc: number;
  logreg_pr_auc: number;
  candidate_pr_auc: number;
}

export interface Report {
  model: Model;
  precision_target: number;
  windows: Record<"train" | "validation" | "test", { from: string; to: string }>;
  thresholds: { threshold: number; precision: number; recall: number; flagged_share: number }[];
  pr_curves: Record<"majority" | "logreg" | "candidate", { recall: number; precision: number }[]>;
  reliability: Record<"candidate" | "logreg", { mean_predicted: number; observed_rate: number; count: number }[]>;
  generalisation?: GeneralisationRow[];
}

export interface Tracker {
  n_scored: number;
  n_awaiting: number;
  brier: number | null;
  reliability: { mean_predicted: number; observed_rate: number; count: number }[];
  bands: { label: string; range: [number, number]; count: number; failure_rate: number | null }[];
  recent: { run_id: number; probability: number; failed: boolean; predicted_at: string; recorded_at: string }[];
}

export interface Health {
  status: "ok";
  active_model: string | null;
  runs: RunCounts;
  scenarios: string[];
}

export interface RunsQuery {
  status?: RunStatus;
  repo?: string;
  limit?: number;
  offset?: number;
}

export interface MetricSpread {
  mean: number | null;
  spread: number | null;
}

export interface ModelSweepScores {
  pr_auc: MetricSpread;
  brier: MetricSpread;
  recall: MetricSpread;
  recall_at_precision?: MetricSpread | null;
}

export interface LeaveOneOutRow {
  scenario: string;
  majority_pr_auc: MetricSpread;
  logreg_pr_auc: MetricSpread;
  candidate_pr_auc: MetricSpread;
}

export interface SweepReport {
  id: number;
  created_at: string;
  seeds: number;
  runs_per_scenario: number;
  candidate: CandidateKind | string;
  precision_target: number;
  gate_pass_rate: number;
  passed_seeds: number;
  metrics: {
    majority: ModelSweepScores;
    logreg: ModelSweepScores;
    candidate: ModelSweepScores;
  };
  leave_one_out?: LeaveOneOutRow[];
}

export interface SweepRequest {
  seeds?: number;
  runs_per_scenario?: number;
  candidate?: CandidateKind;
}

export interface AblationRow {
  group_id: string;
  name: string;
  features: string[];
  pr_auc: MetricSpread;
  delta_pr_auc: MetricSpread;
}

export interface DeliberateLeakReport {
  forbidden_field: string;
  contract_caught: boolean;
  contract_error: string;
  gate_caught: boolean;
  gate_passed: boolean;
  gate_violations: string[];
}

export interface AblationReport {
  id: number;
  created_at: string;
  seeds: number;
  runs_per_scenario: number;
  candidate: CandidateKind | string;
  full_model_pr_auc: MetricSpread;
  groups: AblationRow[];
  deliberate_leak: DeliberateLeakReport;
}

export interface AblationRequest {
  seeds?: number;
  runs_per_scenario?: number;
  candidate?: CandidateKind;
}

export interface RealDataMissingFeature {
  feature: string;
  reason: string;
}

export interface RealDataReport {
  id: number;
  created_at: string;
  dataset_name: string;
  doi: string;
  licence: string;
  total_rows: number;
  candidate: CandidateKind | string;
  metrics: {
    majority: ModelScores;
    logreg: ModelScores;
    candidate: ModelScores;
  };
  gate: {
    passed: boolean;
    reason: string;
    checks: GateCheck[];
  };
  thresholds: {
    threshold: number;
    precision: number;
    recall: number;
    flagged_share: number;
  }[];
  importances: Record<string, number>;
  available_features: string[];
  missing_contract_features: RealDataMissingFeature[];
  dropped_columns: string[];
}

export type DriftStatus = "stable" | "watch" | "shifted";

export interface NumericDriftRow {
  feature: string;
  psi: number;
  ks_statistic: number;
  ks_pvalue: number;
  status: DriftStatus;
  reference_mean: number;
  live_mean: number;
  reference_std: number;
  live_std: number;
  recommendation: string;
}

export interface CategoryShare {
  category: string;
  reference_count: number;
  reference_share: number;
  live_count: number;
  live_share: number;
  delta: number;
}

export interface CategoricalDriftRow {
  feature: string;
  psi: number;
  status: DriftStatus;
  recommendation: string;
  shares: CategoryShare[];
}

export interface DriftReport {
  model_version: string | null;
  reference_window: { from: string; to: string };
  live_window: { from: string; to: string };
  n_reference: number;
  n_live: number;
  overall_status: DriftStatus;
  numeric_features: NumericDriftRow[];
  categorical_features: CategoricalDriftRow[];
}
