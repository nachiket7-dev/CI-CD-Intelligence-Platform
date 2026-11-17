import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { RunDetail } from "@/lib/types";

/**
 * Receipt that the score came first. Two clocks appear: the simulated clock the CI run lives on,
 * and the system clock of when this product scored and recorded things.
 */
export function PredictionTrail({ run }: { run: RunDetail }) {
  return (
    <div>
      <ol className="m-0 list-none border-l border-rule-2 p-0 pl-5">
        {run.trail.map((e) => (
          <li key={e.kind} className="relative pb-5 last:pb-0">
            <span
              aria-hidden="true"
              className={cn("absolute top-1.5 -left-[25px] size-2 rounded-full", e.clock === "system" ? "bg-accent" : "bg-cool")}
            />
            <p className="text-ink">{e.label}</p>
            <p className="text-sm text-muted">
              <span className="num font-outlier">{formatDateTime(e.at)}</span> on the {e.clock} clock
            </p>
          </li>
        ))}
      </ol>
      {run.predicted_before_outcome !== null && (
        <p className="mt-4 text-sm text-ink-2">
          {run.predicted_before_outcome
            ? "The score was stored before the outcome was recorded, and the outcome did not change it."
            : "The score was stored after the outcome was recorded."}
        </p>
      )}
    </div>
  );
}
