import { mockRequest } from "./mocks";
import type {
  CandidateKind,
  Health,
  Model,
  Report,
  Run,
  RunCounts,
  RunDetail,
  RunList,
  RunsQuery,
  SweepReport,
  SweepRequest,
  Tracker,
  AblationReport,
  AblationRequest,
  RealDataReport,
  DriftReport,
} from "./types";

/** Set VITE_USE_MOCKS=true (npm run dev:mock) to build UI without the backend running. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (USE_MOCKS) return mockRequest<T>(method, path, body);

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the backend. Start it with `uvicorn app.main:app --reload` in backend/.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail);
    } catch {
      /* keep the status text */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  health: () => request<Health>("GET", "/health"),
  runs: (q: RunsQuery) => request<RunList>("GET", `/runs${query({ ...q })}`),
  run: (id: number) => request<RunDetail>("GET", `/runs/${id}`),
  scoreRun: (id: number) => request<RunDetail>("POST", `/runs/${id}/predict`),
  finishRun: (id: number) => request<RunDetail>("POST", `/runs/${id}/finish`),
  simulate: (body: { runs_per_scenario?: number; seed?: number; pending?: number } = {}) =>
    request<RunCounts>("POST", "/simulate", body),
  liveRuns: (options: number | { count?: number; drift?: boolean } = 5) => {
    const body = typeof options === "number" ? { count: options } : options;
    return request<Run[]>("POST", "/simulate/live", body);
  },
  models: () => request<Model[]>("GET", "/models"),
  train: (candidate: CandidateKind, seed = 42) => request<Model>("POST", "/models/train", { candidate, seed }),
  promote: (id: number) => request<Model>("POST", `/models/${id}/promote`),
  report: (modelId?: number) => request<Report>("GET", modelId ? `/reports/${modelId}` : "/reports/latest"),
  tracker: () => request<Tracker>("GET", "/tracker"),
  latestSweep: async () => {
    try {
      return await request<SweepReport | null>("GET", "/reports/sweeps/latest");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  runSweep: (body: SweepRequest = {}) => request<SweepReport>("POST", "/reports/sweep", body),
  latestAblation: async () => {
    try {
      return await request<AblationReport | null>("GET", "/reports/ablation");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  runAblation: (body: AblationRequest = {}) => request<AblationReport>("POST", "/reports/ablation", body),
  latestRealdata: async () => {
    try {
      return await request<RealDataReport | null>("GET", "/reports/realdata");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  drift: async (recentRuns = 100) => {
    try {
      return await request<DriftReport | null>("GET", `/drift${query({ recent_runs: recentRuns })}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
};
