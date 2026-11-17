/**
 * Mock backend for building UI without the API running (`npm run dev:mock`).
 *
 * It is stateful in memory, so scoring, finishing, training and promoting behave like the real
 * thing. Everything here is SAMPLE data: totals add up and dates sequence, but none of it is a
 * measurement. The UI shows a "sample data" banner whenever mocks are on.
 */
import type { Model, ModelScores, Prediction, Report, Run, RunDetail, Signal, Tracker } from "./types";

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

function scores(prAuc: number, brier: number, recall: number | null, n = 96): ModelScores {
  return { pr_auc: prAuc, brier, prevalence: 0.19, recall_at_precision: recall, precision_target: 0.5, n };
}

function makeModel(id: number, algo: Model["algo"], status: Model["status"]): Model {
  const weak = algo === "weak_stump";
  const candidate = weak ? scores(0.19, 0.157, null) : scores(0.35, 0.145, 0.14);
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
  };
}

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
    const count = (body as { count?: number } | undefined)?.count ?? 5;
    const last = new Date(`${runs[runs.length - 1].started_at}Z`).getTime();
    const created = Array.from({ length: count }, (_, i) => addRun(last + (i + 1) * 23 * 60_000, true));
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
  if (method === "GET" && p === "/tracker") return out(tracker());

  return fail(404, `Mock route not implemented: ${method} ${p}`);
}
