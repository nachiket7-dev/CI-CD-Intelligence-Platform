import { cn } from "@/lib/cn";
import { featureLabel, formatEffect, formatFeatureValue } from "@/lib/format";
import type { Signal } from "@/lib/types";

/**
 * Top signals for one run. Each is the change in failure probability if that feature had its
 * typical value. These are signals about the model, not proven causes.
 */
export function SignalList({ signals }: { signals: Signal[] }) {
  const max = Math.max(0.0001, ...signals.map((s) => Math.abs(s.effect)));
  return (
    <ul className="m-0 list-none space-y-4 p-0">
      {signals.map((s) => {
        const raises = s.effect >= 0;
        return (
          <li key={s.feature}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-ink">{featureLabel(s.feature)}</span>
              <span className={cn("num font-outlier", raises ? "text-bad" : "text-ok")}>{formatEffect(s.effect)}</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              This run: {formatFeatureValue(s.feature, s.value)}. Typical: {formatFeatureValue(s.feature, s.typical)}.
            </div>
            <div aria-hidden="true" className="mt-1.5 h-1 rounded-pill bg-paper-3">
              <div className={cn("h-full rounded-pill", raises ? "bg-bad" : "bg-ok")} style={{ width: `${(Math.abs(s.effect) / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
