import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import type { AblationRequest, CandidateKind, RunsQuery, SweepRequest } from "./types";

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: api.health });
export const useRuns = (q: RunsQuery) => useQuery({ queryKey: ["runs", q], queryFn: () => api.runs(q) });
export const useRun = (id: number) => useQuery({ queryKey: ["run", id], queryFn: () => api.run(id) });
export const useModels = () => useQuery({ queryKey: ["models"], queryFn: api.models });
export const useReport = (modelId?: number) =>
  useQuery({ queryKey: ["report", modelId ?? "latest"], queryFn: () => api.report(modelId) });
export const useTracker = () => useQuery({ queryKey: ["tracker"], queryFn: api.tracker });
export const useSweepLatest = () => useQuery({ queryKey: ["sweep", "latest"], queryFn: api.latestSweep });
export const useAblationLatest = () => useQuery({ queryKey: ["ablation", "latest"], queryFn: api.latestAblation });
export const useRealDataLatest = () => useQuery({ queryKey: ["realdata", "latest"], queryFn: api.latestRealdata });
export const useDrift = (recentRuns = 100) =>
  useQuery({ queryKey: ["drift", recentRuns], queryFn: () => api.drift(recentRuns) });

/** Any action can change runs, models, the tracker and the health summary, so refresh everything. */
function useAction<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export const useSimulate = () => useAction((_: void) => api.simulate());
export const useLiveRuns = () =>
  useAction((options?: number | { count?: number; drift?: boolean }) => api.liveRuns(options ?? 5));
export const useScoreRun = () => useAction((id: number) => api.scoreRun(id));
export const useFinishRun = () => useAction((id: number) => api.finishRun(id));
export const useTrain = () => useAction((candidate: CandidateKind) => api.train(candidate));
export const usePromote = () => useAction((id: number) => api.promote(id));
export const useRunSweep = () => useAction((req: SweepRequest = {}) => api.runSweep(req));
export const useRunAblation = () => useAction((req: AblationRequest = {}) => api.runAblation(req));
