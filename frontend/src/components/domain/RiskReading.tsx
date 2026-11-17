import { formatPercent } from "@/lib/format";
import { riskBand } from "@/lib/risk";
import type { RunDetail } from "@/lib/types";
import { RunStatusBadge } from "../ui/Badge";

/** The signature object: one reading, set large, with who measured it and what happened next. */
export function RiskReading({ run }: { run: RunDetail }) {
  const p = run.prediction?.probability ?? null;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div>
        <p className="text-sm text-muted">Chance this run fails</p>
        {p === null ? (
          <p className="font-outlier text-3xl text-muted">Not scored</p>
        ) : (
          <p className="num font-outlier text-3xl text-cool" aria-label={`${formatPercent(p)} chance of failure`}>
            {formatPercent(p)}
          </p>
        )}
        <p className="mt-1 text-sm text-ink-2">
          {p === null
            ? "No score yet. Scoring uses only what is known when the run starts."
            : `${riskBand(p).label}. Scored by ${run.prediction!.model_version} before the run finished.`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm text-muted">What happened</p>
        <div className="mt-1">
          <RunStatusBadge status={run.status} />
        </div>
      </div>
    </div>
  );
}
