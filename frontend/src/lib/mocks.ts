/**
 * Mock backend for building UI without the API running (`npm run dev:mock`).
 *
 * It is stateful in memory, so scoring, finishing, training and promoting behave like the real
 * thing. Everything here is SAMPLE data: totals add up and dates sequence, but none of it is a
 * measurement. The UI shows a "sample data" banner whenever mocks are on.
 */
import type {
  AblationReport,
  CandidateKind,
  DriftReport,
  Model,
  ModelScores,
  Prediction,
  RealDataReport,
  Report,
  Run,
  RunDetail,
  Signal,
  SweepReport,
  Tracker,
} from "./types";

const wait = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPOS = ["stable", "risky-deps", "flaky-workflows"];
const WORKFLOWS: Record<string, string[]> = {
  stable: ["build", "unit-tests", "lint"],
  "risky-deps": ["build", "integration-tests", "package-audit"],
  "flaky-workflows": ["build", "e2e-browser", "deploy-preview"],
};
const BASE = Date.UTC(2026, 0, 5, 8, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString().replace("Z", "");

interface MockRun extends Run {
  willFail: boolean;
  duration: number;
  prediction: Prediction | null;
  outcome: RunDetail["outcome"];
}

function scores(prAuc: number, brier: number, recall: number | null, n = 96, brierUncalibrated?: number): ModelScores {
  return {
    pr_auc: prAuc,
    brier,
    prevalence: 0.19,
    recall_at_precision: recall,
    precision_target: 0.5,
    n,
    brier_uncalibrated: brierUncalibrated ?? Math.round((brier + 0.007) * 10000) / 10000,
  };
}

function makeModel(id: number, algo: Model["algo"], status: Model["status"]): Model {
  const weak = algo === "weak_stump";
  const candidate = weak
    ? scores(0.19, 0.157, null, 96, 0.162)
    : scores(0.35, 0.145, 0.14, 96, 0.152);
  const passed = !weak;
  return {
    id,
    version: `v${String(id).padStart(3, "0")}-${algo}`,
    algo,
    seed: 42,
    status,
    created_at: iso(Date.now()),
    n_train: 2400,
    n_val: 800,
    n_test: 800,
    metrics: { majority: scores(0.19, 0.157, null), logreg: scores(0.34, 0.148, 0.125), candidate },
    gate: {
      passed,
      reason: passed ? "Passed all gate checks." : "Rejected: Candidate PR-AUC 0.190 vs best baseline (logreg) 0.340: gain -0.150, required +0.010.",
      checks: [
        { name: "beats_baseline_pr_auc", passed, detail: `Candidate PR-AUC ${candidate.pr_auc.toFixed(3)} vs best baseline (logreg) 0.340: gain ${(candidate.pr_auc - 0.34).toFixed(3)}, required +0.010.` },
        { name: "brier_not_worse", passed, detail: `Candidate Brier ${candidate.brier.toFixed(4)} vs best baseline 0.1480 (tolerance 0.0020).` },
        { name: "leakage_contract", passed: true, detail: "Feature columns satisfy the contract." },
      ],
    },
    importances: {
      workflow_fail_rate_recent: 0.118,
      queue_depth_at_start: 0.041,
      lines_changed: 0.035,
      touches_dependencies: 0.026,
      hours_since_last_failure: 0.019,
      author_recent_fail_rate: 0.012,
      hour_of_day: 0.006,
    },
  };
}

const rand = seeded(7);
let nextRunId = 1;
const runs: MockRun[] = [];
function addRun(startMs: number, pending: boolean): MockRun {
  const repo = REPOS[Math.floor(rand() * REPOS.length)];
  const workflows = WORKFLOWS[repo];
  const lines = Math.max(1, Math.round(Math.exp(3 + rand() * 3.2)));
  const deps = rand() < 0.22;
  const risk = 0.08 + (deps ? 0.18 : 0) + Math.min(0.25, lines / 2400) + (repo === "flaky-workflows" ? 0.12 : 0);
  const willFail = rand() < risk;
  const duration = 120 + rand() * 600;
  const run: MockRun = {
    id: nextRunId++,
    repo,
    workflow_name: workflows[Math.floor(rand() * workflows.length)],
    trigger_type: ["push", "pull_request", "schedule"][Math.floor(rand() * 3)],
    author: `dev-0${Math.floor(rand() * 6)}`,
    files_changed: Math.max(1, Math.round(lines / 30)),
    lines_changed: lines,
    touches_dependencies: deps,
    touches_ci_config: rand() < 0.05,
    queue_depth_at_start: Math.round(rand() * 9),
    started_at: iso(startMs),
    status: pending ? "pending" : willFail ? "failed" : "passed",
    risk: null,
    model_version: null,
    willFail,
    duration,
    prediction: null,
    outcome: pending
      ? null
      : { failed: willFail, duration_s: duration, finished_at: iso(startMs + duration * 1000), recorded_at: iso(BASE) },
  };
  runs.push(run);
  return run;
}
for (let i = 0; i < 54; i++) addRun(BASE + i * 41 * 60_000, i >= 48);

const models: Model[] = [makeModel(2, "weak_stump", "rejected"), makeModel(1, "hist_gb", "active")];

function signalsFor(run: MockRun): Signal[] {
  const all: Signal[] = [
    { feature: "workflow_fail_rate_recent", value: run.repo === "flaky-workflows" ? 0.31 : 0.12, typical: 0.15, effect: run.repo === "flaky-workflows" ? 0.09 : -0.02 },
    { feature: "lines_changed", value: run.lines_changed, typical: 52, effect: Math.min(0.14, (run.lines_changed - 52) / 1600) },
    { feature: "touches_dependencies", value: run.touches_dependencies ? 1 : 0, typical: 0, effect: run.touches_dependencies ? 0.07 : -0.01 },
    { feature: "queue_depth_at_start", value: run.queue_depth_at_start, typical: 5, effect: (run.queue_depth_at_start - 5) / 90 },
  ];
  return all.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}

function score(run: MockRun) {
  const signals = signalsFor(run);
  const p = Math.min(0.92, Math.max(0.03, 0.15 + signals.reduce((sum, s) => sum + s.effect, 0)));
  run.risk = p;
  run.model_version = models.find((m) => m.status === "active")!.version;
  run.prediction = {
    id: run.id,
    probability: p,
    model_version: run.model_version,
    predicted_at: iso(Date.now()),
    signals,
    features: {
      repo: run.repo,
      workflow_name: run.workflow_name,
      trigger_type: run.trigger_type,
      files_changed: run.files_changed,
      lines_changed: run.lines_changed,
      touches_dependencies: Number(run.touches_dependencies),
      touches_ci_config: Number(run.touches_ci_config),
      queue_depth_at_start: run.queue_depth_at_start,
      workflow_fail_rate_recent: 0.14,
      hours_since_last_failure: 31.5,
      author_recent_fail_rate: 0.17,
      hour_of_day: 14,
      day_of_week: 2,
    },
  };
}
// A few earlier predictions so the tracker has something to show.
runs.filter((r) => r.status !== "pending").slice(-18).forEach((r) => {
  score(r);
  r.prediction!.predicted_at = iso(BASE);
});
runs.filter((r) => r.status === "pending").slice(0, 3).forEach(score);

function detail(run: MockRun): RunDetail {
  const trail: RunDetail["trail"] = [{ kind: "started", label: "Run started", at: run.started_at, clock: "simulated" }];
  if (run.prediction) trail.push({ kind: "scored", label: "Risk scored before the run finished", at: run.prediction.predicted_at, clock: "system" });
  if (run.outcome) {
    trail.push({ kind: "finished", label: run.outcome.failed ? "Run failed" : "Run passed", at: run.outcome.finished_at, clock: "simulated" });
    trail.push({ kind: "recorded", label: "Outcome recorded", at: run.outcome.recorded_at, clock: "system" });
  }
  const { willFail: _w, duration: _d, ...rest } = run;
  return { ...rest, trail, predicted_before_outcome: run.prediction && run.outcome ? true : null };
}

const counts = (list: MockRun[]) => ({
  total: list.length,
  pending: list.filter((r) => r.status === "pending").length,
  passed: list.filter((r) => r.status === "passed").length,
  failed: list.filter((r) => r.status === "failed").length,
});

function report(model: Model): Report {
  const pr = (top: number, power: number) =>
    Array.from({ length: 21 }, (_, i) => {
      const recall = i / 20;
      return { recall, precision: 0.19 + (top - 0.19) * Math.pow(1 - recall, power) };
    });
  const weak = model.algo === "weak_stump";
  const rel = (spread: number) =>
    [0.06, 0.12, 0.18, 0.25, 0.33, 0.45].map((p) => ({ mean_predicted: p, observed_rate: Math.max(0.02, p + spread * (0.5 - p)), count: 16 }));
  return {
    model,
    precision_target: 0.5,
    windows: {
      train: { from: "2026-01-05T08:00:00", to: "2026-02-18T11:12:00" },
      validation: { from: "2026-02-18T11:20:00", to: "2026-03-06T09:40:00" },
      test: { from: "2026-03-06T09:55:00", to: "2026-03-24T17:30:00" },
    },
    thresholds: [0.1, 0.2, 0.3, 0.4, 0.5].map((t, i) => ({ threshold: t, precision: 0.22 + i * 0.07, recall: 0.9 - i * 0.17, flagged_share: 0.8 - i * 0.16 })),
    pr_curves: { majority: pr(0.19, 0), logreg: pr(0.62, 3.2), candidate: pr(weak ? 0.2 : 0.66, weak ? 6 : 3.0) },
    reliability: { candidate: rel(weak ? 0.5 : 0.12), logreg: rel(0.2) },
    generalisation: [
      { scenario: "busy-queue", majority_pr_auc: 0.182, logreg_pr_auc: 0.315, candidate_pr_auc: weak ? 0.183 : 0.328 },
      { scenario: "flaky-workflows", majority_pr_auc: 0.21, logreg_pr_auc: 0.322, candidate_pr_auc: weak ? 0.195 : 0.339 },
      { scenario: "risky-deps", majority_pr_auc: 0.188, logreg_pr_auc: 0.334, candidate_pr_auc: weak ? 0.19 : 0.345 },
      { scenario: "stable", majority_pr_auc: 0.185, logreg_pr_auc: 0.351, candidate_pr_auc: weak ? 0.189 : 0.362 },
    ],
  };
}

export const SAMPLE_REPORT: Report = report(models[1]);

function tracker(): Tracker {
  const scored = runs.filter((r) => r.outcome && r.prediction);
  const brier = scored.reduce((s, r) => s + Math.pow(r.prediction!.probability - Number(r.outcome!.failed), 2), 0) / Math.max(1, scored.length);
  const band = (label: string, lo: number, hi: number) => {
    const sel = scored.filter((r) => r.prediction!.probability >= lo && r.prediction!.probability < hi);
    return { label, range: [lo, Math.min(hi, 1)] as [number, number], count: sel.length, failure_rate: sel.length ? sel.filter((r) => r.outcome!.failed).length / sel.length : null };
  };
  return {
    n_scored: scored.length,
    n_awaiting: runs.filter((r) => !r.outcome && r.prediction).length,
    brier: scored.length ? brier : null,
    reliability: [],
    bands: [band("Low", 0, 0.2), band("Medium", 0.2, 0.5), band("High", 0.5, 1.01)],
    recent: scored.slice(-12).reverse().map((r) => ({ run_id: r.id, probability: r.prediction!.probability, failed: r.outcome!.failed, predicted_at: r.prediction!.predicted_at, recorded_at: r.outcome!.recorded_at })),
  };
}

export function makeMockSweep(candidate: CandidateKind = "hist_gb", seeds = 5, runsPerScenario = 1000): SweepReport {
  const weak = candidate === "weak_stump";
  return {
    id: 1,
    created_at: iso(Date.now()),
    seeds,
    runs_per_scenario: runsPerScenario,
    candidate,
    precision_target: 0.5,
    gate_pass_rate: weak ? 0.0 : 1.0,
    passed_seeds: weak ? 0 : seeds,
    metrics: {
      majority: {
        pr_auc: { mean: 0.191, spread: 0.002 },
        brier: { mean: 0.155, spread: 0.001 },
        recall: { mean: null, spread: null },
      },
      logreg: {
        pr_auc: { mean: 0.342, spread: 0.015 },
        brier: { mean: 0.147, spread: 0.002 },
        recall: { mean: 0.128, spread: 0.024 },
      },
      candidate: {
        pr_auc: weak ? { mean: 0.19, spread: 0.005 } : { mean: 0.354, spread: 0.012 },
        brier: weak ? { mean: 0.156, spread: 0.003 } : { mean: 0.144, spread: 0.002 },
        recall: weak ? { mean: null, spread: null } : { mean: 0.142, spread: 0.018 },
      },
    },
    leave_one_out: [
      {
        scenario: "busy-queue",
        majority_pr_auc: { mean: 0.182, spread: 0.004 },
        logreg_pr_auc: { mean: 0.315, spread: 0.012 },
        candidate_pr_auc: weak ? { mean: 0.183, spread: 0.006 } : { mean: 0.328, spread: 0.014 },
      },
      {
        scenario: "flaky-workflows",
        majority_pr_auc: { mean: 0.21, spread: 0.005 },
        logreg_pr_auc: { mean: 0.322, spread: 0.018 },
        candidate_pr_auc: weak ? { mean: 0.195, spread: 0.008 } : { mean: 0.339, spread: 0.016 },
      },
      {
        scenario: "risky-deps",
        majority_pr_auc: { mean: 0.188, spread: 0.003 },
        logreg_pr_auc: { mean: 0.334, spread: 0.014 },
        candidate_pr_auc: weak ? { mean: 0.19, spread: 0.005 } : { mean: 0.345, spread: 0.011 },
      },
      {
        scenario: "stable",
        majority_pr_auc: { mean: 0.185, spread: 0.003 },
        logreg_pr_auc: { mean: 0.351, spread: 0.011 },
        candidate_pr_auc: weak ? { mean: 0.189, spread: 0.004 } : { mean: 0.362, spread: 0.015 },
      },
    ],
  };
}

export const SAMPLE_SWEEP: SweepReport = makeMockSweep("hist_gb");
let latestSweep: SweepReport | null = SAMPLE_SWEEP;

export function makeMockAblation(
  candidate: CandidateKind = "hist_gb",
  seeds = 5,
  runsPerScenario = 1000,
): AblationReport {
  return {
    id: 1,
    created_at: iso(Date.now()),
    seeds,
    runs_per_scenario: runsPerScenario,
    candidate,
    full_model_pr_auc: { mean: 0.354, spread: 0.012 },
    groups: [
      {
        group_id: "rolling_history",
        name: "Rolling history features",
        features: ["workflow_fail_rate_recent", "hours_since_last_failure", "author_recent_fail_rate"],
        pr_auc: { mean: 0.312, spread: 0.015 },
        delta_pr_auc: { mean: -0.042, spread: 0.008 },
      },
      {
        group_id: "queue_and_timing",
        name: "Queue and timing",
        features: ["queue_depth_at_start", "hour_of_day", "day_of_week"],
        pr_auc: { mean: 0.341, spread: 0.011 },
        delta_pr_auc: { mean: -0.013, spread: 0.005 },
      },
      {
        group_id: "change_size",
        name: "Change size",
        features: ["files_changed", "lines_changed"],
        pr_auc: { mean: 0.338, spread: 0.014 },
        delta_pr_auc: { mean: -0.016, spread: 0.006 },
      },
      {
        group_id: "dependency_and_ci_flags",
        name: "Dependency and CI-config flags",
        features: ["touches_dependencies", "touches_ci_config"],
        pr_auc: { mean: 0.348, spread: 0.013 },
        delta_pr_auc: { mean: -0.006, spread: 0.003 },
      },
    ],
    deliberate_leak: {
      forbidden_field: "duration_s",
      contract_caught: true,
      contract_error: "'duration_s' is only known after the run (forbidden)",
      gate_caught: true,
      gate_passed: false,
      gate_violations: ["'duration_s' is only known after the run (forbidden)"],
    },
  };
}

export const SAMPLE_ABLATION: AblationReport = makeMockAblation("hist_gb");
let latestAblation: AblationReport | null = SAMPLE_ABLATION;

export const SAMPLE_REALDATA_REPORT: RealDataReport = {
  id: 1,
  created_at: iso(Date.now()),
  dataset_name: "Mendeley Data: GitHub Actions CI/CD failure dataset (GADFPD)",
  doi: "10.17632/mggwn7rj9f.1",
  licence: "CC BY 4.0",
  total_rows: 303079,
  candidate: "hist_gb",
  metrics: {
    majority: scores(0.185, 0.158, null),
    logreg: scores(0.338, 0.149, 0.12),
    candidate: scores(0.358, 0.143, 0.15, 96, 0.151),
  },
  gate: {
    passed: true,
    reason: "Passed all gate checks.",
    checks: [
      { name: "beats_baseline_pr_auc", passed: true, detail: "Candidate PR-AUC 0.358 vs best baseline 0.338: gain +0.020, required +0.010." },
      { name: "brier_not_worse", passed: true, detail: "Candidate Brier 0.1430 vs best baseline 0.1490." },
      { name: "leakage_contract", passed: true, detail: "Clean: no columns violate contract.py." },
    ],
  },
  thresholds: [
    { threshold: 0.1, precision: 0.24, recall: 0.88, flagged_share: 0.76 },
    { threshold: 0.2, precision: 0.32, recall: 0.72, flagged_share: 0.52 },
    { threshold: 0.3, precision: 0.41, recall: 0.58, flagged_share: 0.38 },
    { threshold: 0.4, precision: 0.48, recall: 0.44, flagged_share: 0.25 },
    { threshold: 0.5, precision: 0.54, recall: 0.32, flagged_share: 0.16 },
  ],
  importances: {
    workflow_fail_rate_recent: 0.124,
    lines_changed: 0.045,
    files_changed: 0.038,
    hours_since_last_failure: 0.022,
    author_recent_fail_rate: 0.015,
    hour_of_day: 0.008,
  },
  available_features: [
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
  ],
  missing_contract_features: [
    {
      feature: "touches_dependencies",
      reason: "Commit churn is recorded, but not individual file paths or diffs.",
    },
    {
      feature: "touches_ci_config",
      reason: "Changes to .github/workflows/* are not flagged in commit metadata.",
    },
    {
      feature: "queue_depth_at_start",
      reason: "Runner queue depth at start instant is not available in the dataset.",
    },
  ],
  dropped_columns: [
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
  ],
};
let latestRealdata: RealDataReport | null = SAMPLE_REALDATA_REPORT;

export const SAMPLE_DRIFT_REPORT: DriftReport = {
  model_version: "v004-hist_gb",
  reference_window: { from: "2026-01-05T08:13:48", to: "2026-01-15T07:39:41" },
  live_window: { from: "2026-01-31T00:16:22", to: "2026-02-02T16:45:10" },
  n_reference: 2400,
  n_live: 100,
  overall_status: "shifted",
  numeric_features: [
    {
      feature: "queue_depth_at_start",
      psi: 0.428,
      ks_statistic: 0.612,
      ks_pvalue: 0.000001,
      status: "shifted",
      reference_mean: 2.85,
      live_mean: 18.24,
      reference_std: 1.94,
      live_std: 4.12,
      recommendation: "Significant shift. Retrain the model on recent data or check CI environment changes.",
    },
    {
      feature: "workflow_fail_rate_recent",
      psi: 0.142,
      ks_statistic: 0.185,
      ks_pvalue: 0.0215,
      status: "watch",
      reference_mean: 0.189,
      live_mean: 0.245,
      reference_std: 0.12,
      live_std: 0.15,
      recommendation: "Moderate shift detected. Monitor failure rate and model predictions closely.",
    },
    {
      feature: "hours_since_last_failure",
      psi: 0.082,
      ks_statistic: 0.112,
      ks_pvalue: 0.142,
      status: "stable",
      reference_mean: 14.2,
      live_mean: 12.8,
      reference_std: 10.5,
      live_std: 9.8,
      recommendation: "Distribution matches training. No action needed.",
    },
    {
      feature: "files_changed",
      psi: 0.045,
      ks_statistic: 0.078,
      ks_pvalue: 0.451,
      status: "stable",
      reference_mean: 5.6,
      live_mean: 5.4,
      reference_std: 4.2,
      live_std: 3.9,
      recommendation: "Distribution matches training. No action needed.",
    },
    {
      feature: "lines_changed",
      psi: 0.038,
      ks_statistic: 0.065,
      ks_pvalue: 0.628,
      status: "stable",
      reference_mean: 148.5,
      live_mean: 142.1,
      reference_std: 195.0,
      live_std: 182.4,
      recommendation: "Distribution matches training. No action needed.",
    },
    {
      feature: "author_recent_fail_rate",
      psi: 0.035,
      ks_statistic: 0.061,
      ks_pvalue: 0.695,
      status: "stable",
      reference_mean: 0.192,
      live_mean: 0.188,
      reference_std: 0.11,
      live_std: 0.105,
      recommendation: "Distribution matches training. No action needed.",
    },
    {
      feature: "touches_dependencies",
      psi: 0.018,
      ks_statistic: 0.042,
      ks_pvalue: 0.945,
      status: "stable",
      reference_mean: 0.18,
      live_mean: 0.20,
      reference_std: 0.38,
      live_std: 0.40,
      recommendation: "Distribution matches training. No action needed.",
    },
    {
      feature: "touches_ci_config",
      psi: 0.012,
      ks_statistic: 0.025,
      ks_pvalue: 0.999,
      status: "stable",
      reference_mean: 0.10,
      live_mean: 0.11,
      reference_std: 0.30,
      live_std: 0.31,
      recommendation: "Distribution matches training. No action needed.",
    },
    {
      feature: "hour_of_day",
      psi: 0.052,
      ks_statistic: 0.091,
      ks_pvalue: 0.312,
      status: "stable",
      reference_mean: 13.4,
      live_mean: 14.1,
      reference_std: 4.8,
      live_std: 4.6,
      recommendation: "Distribution matches training. No action needed.",
    },
    {
      feature: "day_of_week",
      psi: 0.048,
      ks_statistic: 0.084,
      ks_pvalue: 0.385,
      status: "stable",
      reference_mean: 2.1,
      live_mean: 2.3,
      reference_std: 1.4,
      live_std: 1.5,
      recommendation: "Distribution matches training. No action needed.",
    },
  ],
  categorical_features: [
    {
      feature: "trigger_type",
      psi: 0.022,
      status: "stable",
      recommendation: "Distribution matches training. No action needed.",
      shares: [
        { category: "push", reference_count: 1440, reference_share: 0.60, live_count: 58, live_share: 0.58, delta: -0.02 },
        { category: "pull_request", reference_count: 720, reference_share: 0.30, live_count: 32, live_share: 0.32, delta: 0.02 },
        { category: "schedule", reference_count: 240, reference_share: 0.10, live_count: 10, live_share: 0.10, delta: 0.00 },
      ],
    },
    {
      feature: "repo",
      psi: 0.018,
      status: "stable",
      recommendation: "Distribution matches training. No action needed.",
      shares: [
        { category: "busy-queue", reference_count: 600, reference_share: 0.25, live_count: 26, live_share: 0.26, delta: 0.01 },
        { category: "flaky-workflows", reference_count: 600, reference_share: 0.25, live_count: 24, live_share: 0.24, delta: -0.01 },
        { category: "risky-deps", reference_count: 600, reference_share: 0.25, live_count: 25, live_share: 0.25, delta: 0.00 },
        { category: "stable", reference_count: 600, reference_share: 0.25, live_count: 25, live_share: 0.25, delta: 0.00 },
      ],
    },
  ],
};
let latestDrift: DriftReport | null = SAMPLE_DRIFT_REPORT;

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

export async function mockRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  await wait();
  const url = new URL(path, "http://mock");
  const p = url.pathname;
  const out = (value: unknown) => value as T;

  if (method === "GET" && p === "/health")
    return out({ status: "ok", active_model: models.find((m) => m.status === "active")?.version ?? null, runs: counts(runs), scenarios: REPOS });

  if (method === "GET" && p === "/runs") {
    const status = url.searchParams.get("status");
    const repo = url.searchParams.get("repo");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const scoped = runs.filter((r) => !repo || r.repo === repo);
    const filtered = scoped.filter((r) => !status || r.status === status).slice().reverse();
    return out({ items: filtered.slice(offset, offset + limit).map(detail), counts: counts(scoped), repos: REPOS });
  }

  const runMatch = p.match(/^\/runs\/(\d+)(?:\/(predict|finish))?$/);
  if (runMatch) {
    const run = runs.find((r) => r.id === Number(runMatch[1]));
    if (!run) fail(404, `Run ${runMatch[1]} does not exist.`);
    if (method === "GET") return out(detail(run));
    if (runMatch[2] === "predict") {
      if (run.outcome) fail(409, `Run ${run.id} already finished, so scoring it now would be hindsight.`);
      if (!models.some((m) => m.status === "active")) fail(409, "No active model yet. Train a candidate and promote it first.");
      score(run);
    } else if (runMatch[2] === "finish") {
      if (run.outcome) fail(409, `Run ${run.id} already has a recorded outcome.`);
      const startMs = new Date(`${run.started_at}Z`).getTime();
      run.outcome = { failed: run.willFail, duration_s: run.duration, finished_at: iso(startMs + run.duration * 1000), recorded_at: iso(Date.now()) };
      run.status = run.willFail ? "failed" : "passed";
    }
    return out(detail(run));
  }

  if (method === "POST" && p === "/simulate") return out(counts(runs));
  if (method === "POST" && p === "/simulate/live") {
    const { count = 5, drift = false } = (body as { count?: number; drift?: boolean } | undefined) ?? {};
    const last = new Date(`${runs[runs.length - 1].started_at}Z`).getTime();
    const created = Array.from({ length: count }, (_, i) => {
      const r = addRun(last + (i + 1) * 23 * 60_000, true);
      if (drift) {
        r.queue_depth_at_start = Math.round(18 + Math.random() * 8);
      }
      return r;
    });
    if (models.some((m) => m.status === "active")) created.forEach(score);
    return out(created.map(detail));
  }

  if (method === "GET" && p === "/models") return out(models.slice().sort((a, b) => b.id - a.id));
  if (method === "POST" && p === "/models/train") {
    const algo = (body as { candidate: Model["algo"] }).candidate;
    const weak = algo === "weak_stump";
    const model = makeModel(Math.max(...models.map((m) => m.id)) + 1, algo, weak ? "rejected" : "candidate");
    models.unshift(model);
    return out(model);
  }
  const promote = p.match(/^\/models\/(\d+)\/promote$/);
  if (method === "POST" && promote) {
    const model = models.find((m) => m.id === Number(promote[1]));
    if (!model) fail(404, "Model does not exist.");
    if (model.status !== "candidate") fail(409, `${model.version} cannot be promoted. ${model.gate.reason}`);
    models.forEach((m) => m.status === "active" && (m.status = "retired"));
    model.status = "active";
    return out(model);
  }

  const rep = p.match(/^\/reports\/(latest|\d+)$/);
  if (method === "GET" && rep) {
    const model = rep[1] === "latest" ? models.slice().sort((a, b) => b.id - a.id)[0] : models.find((m) => m.id === Number(rep[1]));
    if (!model) fail(404, "No evaluation report yet. Train a model first.");
    return out(report(model));
  }
  if (method === "GET" && (p === "/reports/sweeps/latest" || p === "/reports/sweep/latest")) {
    if (!latestSweep) fail(404, "No seed sweep report yet. Run a sweep first.");
    return out(latestSweep);
  }
  if (method === "POST" && p === "/reports/sweep") {
    const candidateKind = (body as { candidate?: CandidateKind } | undefined)?.candidate ?? "hist_gb";
    const seedsCount = (body as { seeds?: number } | undefined)?.seeds ?? 5;
    const runsCount = (body as { runs_per_scenario?: number } | undefined)?.runs_per_scenario ?? 1000;
    latestSweep = makeMockSweep(candidateKind, seedsCount, runsCount);
    return out(latestSweep);
  }
  if (method === "GET" && p === "/reports/ablation") {
    if (!latestAblation) fail(404, "No ablation report yet. Run an ablation study first.");
    return out(latestAblation);
  }
  if (method === "POST" && p === "/reports/ablation") {
    const candidateKind = (body as { candidate?: CandidateKind } | undefined)?.candidate ?? "hist_gb";
    const seedsCount = (body as { seeds?: number } | undefined)?.seeds ?? 5;
    const runsCount = (body as { runs_per_scenario?: number } | undefined)?.runs_per_scenario ?? 1000;
    latestAblation = makeMockAblation(candidateKind, seedsCount, runsCount);
    return out(latestAblation);
  }
  if (method === "GET" && p === "/reports/realdata") {
    if (!latestRealdata) fail(404, "No real data check report yet.");
    return out(latestRealdata);
  }
  if (method === "GET" && p.startsWith("/drift")) {
    if (!latestDrift) fail(404, "No live runs found after model evaluation window.");
    return out(latestDrift);
  }
  if (method === "GET" && p === "/tracker") return out(tracker());

  return fail(404, `Mock route not implemented: ${method} ${p}`);
}
