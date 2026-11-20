import { Button } from "@/components/ui/Button";
import { Stat, StatRow } from "@/components/ui/Stat";
import { Table, TD, TH } from "@/components/ui/Table";
import { formatPercent } from "@/lib/format";

export interface ThresholdRow {
  threshold: number;
  precision: number;
  recall: number;
  flagged_share: number;
}

export function interpolateMetrics(
  thresholds: ThresholdRow[],
  targetThreshold: number,
): { precision: number; recall: number; flagged_share: number } {
  if (!thresholds || thresholds.length === 0) {
    return { precision: 0, recall: 0, flagged_share: 0 };
  }
  const sorted = [...thresholds].sort((a, b) => a.threshold - b.threshold);
  if (targetThreshold <= sorted[0].threshold) {
    return {
      precision: sorted[0].precision,
      recall: sorted[0].recall,
      flagged_share: sorted[0].flagged_share,
    };
  }
  const last = sorted[sorted.length - 1];
  if (targetThreshold >= last.threshold) {
    return {
      precision: last.precision,
      recall: last.recall,
      flagged_share: last.flagged_share,
    };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (targetThreshold >= a.threshold && targetThreshold <= b.threshold) {
      const span = b.threshold - a.threshold;
      const frac = span === 0 ? 0 : (targetThreshold - a.threshold) / span;
      return {
        precision: a.precision + frac * (b.precision - a.precision),
        recall: a.recall + frac * (b.recall - a.recall),
        flagged_share: a.flagged_share + frac * (b.flagged_share - a.flagged_share),
      };
    }
  }
  return { precision: last.precision, recall: last.recall, flagged_share: last.flagged_share };
}

export function findTargetThreshold(
  thresholds: ThresholdRow[],
  precisionTarget: number,
): ThresholdRow | undefined {
  if (!thresholds || thresholds.length === 0) return undefined;
  const sorted = [...thresholds].sort((a, b) => a.threshold - b.threshold);
  return sorted.find((r) => r.precision >= precisionTarget);
}

interface ThresholdChooserProps {
  thresholds: ThresholdRow[];
  precisionTarget: number;
  value: number;
  onChange: (value: number) => void;
}

export function ThresholdChooser({
  thresholds,
  precisionTarget,
  value,
  onChange,
}: ThresholdChooserProps) {
  const sortedThresholds = [...(thresholds ?? [])].sort((a, b) => a.threshold - b.threshold);
  const minThreshold = sortedThresholds[0]?.threshold ?? 0.05;
  const maxThreshold = sortedThresholds[sortedThresholds.length - 1]?.threshold ?? 0.95;

  const targetRow = findTargetThreshold(sortedThresholds, precisionTarget);
  const currentMetrics = interpolateMetrics(sortedThresholds, value);

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-rule bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink">
              Configured precision target: {formatPercent(precisionTarget)}
            </div>
            <div className="mt-1 text-sm text-muted">
              {targetRow ? (
                <>
                  Lowest threshold reaching target precision is{" "}
                  <span className="num font-outlier font-medium text-cool">
                    {formatPercent(targetRow.threshold)}
                  </span>{" "}
                  (precision {formatPercent(targetRow.precision)}, recall {formatPercent(targetRow.recall)}).
                </>
              ) : (
                `No evaluated threshold reaches the ${formatPercent(precisionTarget)} precision target.`
              )}
            </div>
          </div>
          {targetRow && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onChange(targetRow.threshold)}
            >
              Use target ({formatPercent(targetRow.threshold)})
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-card border border-rule bg-paper p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="threshold-slider" className="block text-sm font-medium text-ink">
              Failure probability threshold
            </label>
            <p className="mt-0.5 text-sm text-muted">
              Runs with predicted risk at or above this cutoff are flagged for investigation.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <input
                id="threshold-slider"
                type="range"
                min={minThreshold}
                max={maxThreshold}
                step={0.01}
                value={value}
                aria-label="Failure probability threshold slider"
                aria-valuemin={minThreshold}
                aria-valuemax={maxThreshold}
                aria-valuenow={value}
                aria-valuetext={formatPercent(value)}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer accent-accent"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="threshold-number" className="text-sm text-muted">
              Threshold
            </label>
            <input
              id="threshold-number"
              type="number"
              min={minThreshold}
              max={maxThreshold}
              step={0.01}
              value={Math.round(value * 100) / 100}
              aria-label="Failure probability threshold number"
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) onChange(Math.max(minThreshold, Math.min(maxThreshold, val)));
              }}
              className="num h-9 w-24 rounded-pill border border-rule-2 bg-paper px-2.5 text-right font-outlier text-ink pointer-coarse:h-11"
            />
          </div>
        </div>

        <div className="mt-6 border-t border-rule pt-4">
          <StatRow>
            <Stat
              label="Selected threshold"
              value={formatPercent(value)}
              note="Cutoff value"
              tone="ink"
            />
            <Stat
              label="Live precision"
              value={formatPercent(currentMetrics.precision)}
              note="True alarms share"
              tone="cool"
            />
            <Stat
              label="Live recall"
              value={formatPercent(currentMetrics.recall)}
              note="Failures caught"
              tone="cool"
            />
            <Stat
              label="Runs flagged"
              value={formatPercent(currentMetrics.flagged_share)}
              note="Inspected fraction"
              tone="ink"
            />
          </StatRow>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium text-ink">Evaluated thresholds reference</h4>
        <Table caption="Precision, recall and share of runs flagged at each evaluated threshold">
          <thead>
            <tr>
              <TH>Flag runs at or above</TH>
              <TH className="text-right">Precision</TH>
              <TH className="text-right">Recall</TH>
              <TH className="text-right">Runs flagged</TH>
            </tr>
          </thead>
          <tbody>
            {sortedThresholds.map((t) => {
              const isSelected = Math.abs(t.threshold - value) < 0.01;
              const isTarget = targetRow && Math.abs(t.threshold - targetRow.threshold) < 0.01;
              return (
                <tr
                  key={t.threshold}
                  className={isSelected ? "bg-paper-3" : undefined}
                >
                  <TD className="num font-outlier">
                    <button
                      type="button"
                      onClick={() => onChange(t.threshold)}
                      className="num font-outlier text-ink underline underline-offset-4"
                    >
                      {formatPercent(t.threshold)}
                    </button>
                    {isTarget && (
                      <span className="ml-2 inline-flex items-center rounded-pill bg-cool-soft px-1.5 py-0.5 text-xs font-medium text-cool">
                        target
                      </span>
                    )}
                  </TD>
                  <TD className="num text-right font-outlier">{formatPercent(t.precision)}</TD>
                  <TD className="num text-right font-outlier">{formatPercent(t.recall)}</TD>
                  <TD className="num text-right font-outlier">{formatPercent(t.flagged_share)}</TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
