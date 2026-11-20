import { Link } from "react-router-dom";

import { LineChart } from "@/components/charts/LineChart";
import { RunStatusBadge } from "@/components/ui/Badge";
import { DataState, EmptyState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Stat, StatRow } from "@/components/ui/Stat";
import { Table, TD, TH } from "@/components/ui/Table";
import { formatDateTime, formatDecimal, formatPercent } from "@/lib/format";
import { useTracker } from "@/lib/hooks";

export function TrackerPage() {
  const tracker = useTracker();
  return (
    <>
      <PageHeader
        title="Prediction tracker"
        description="How scores compared with what happened. Only runs scored before they finished are counted."
      />
      <DataState
        query={tracker}
        skeleton={<SkeletonRows rows={6} label="Loading tracker" />}
        isEmpty={(t) => t.n_scored === 0}
        empty={
          <Panel>
            <EmptyState
              title="No scored runs have finished yet"
              body={`Score a running run, then finish it, and the comparison appears here. Runs waiting for an outcome: ${tracker.data?.n_awaiting ?? 0}.`}
              action={<Link to="/?status=pending">Open running runs</Link>}
            />
          </Panel>
        }
      >
        {(t) => (
          <div className="space-y-6">
            <Panel>
              <StatRow>
                <Stat label="Scored and finished" value={t.n_scored} />
                <Stat label="Scored, still running" value={t.n_awaiting} />
                <Stat label="Brier score" value={formatDecimal(t.brier, 3)} tone="cool" note="Lower is better" />
              </StatRow>
            </Panel>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Failure rate by risk band" description="A well-calibrated model fails more often in higher bands.">
                <Table caption="Observed failure rate for each risk band">
                  <thead>
                    <tr>
                      <TH>Band</TH>
                      <TH className="text-right">Runs</TH>
                      <TH className="text-right">Failed</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {t.bands.map((b) => (
                      <tr key={b.label}>
                        <TD>
                          {b.label} <span className="num font-outlier text-muted">{formatPercent(b.range[0])} to {formatPercent(b.range[1])}</span>
                        </TD>
                        <TD className="num text-right font-outlier">{b.count}</TD>
                        <TD className="num text-right font-outlier">{b.failure_rate === null ? "n/a" : formatPercent(b.failure_rate)}</TD>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Panel>
              <Panel title="Calibration" description="Predicted risk against how often those runs failed.">
                {t.reliability.length ? (
                  <LineChart
                    title="Reliability of live predictions"
                    xLabel="Predicted chance of failure"
                    yLabel="Observed failure rate"
                    diagonal
                    series={[{ name: "Live predictions", tone: "cool", markers: true, points: t.reliability.map((p) => ({ x: p.mean_predicted, y: p.observed_rate })) }]}
                  />
                ) : (
                  <p className="text-ink-2">The chart appears after about 20 scored runs have finished.</p>
                )}
              </Panel>
            </div>
            <Panel title="Recent predictions">
              <Table caption="Most recent scored runs and their outcomes">
                <thead>
                  <tr>
                    <TH>Run</TH>
                    <TH className="text-right">Predicted</TH>
                    <TH>Outcome</TH>
                    <TH>Scored</TH>
                  </tr>
                </thead>
                <tbody>
                  {t.recent.map((r) => (
                    <tr key={r.run_id}>
                      <TD>
                        <Link to={`/runs/${r.run_id}`} aria-label={`View run #${r.run_id}`} className="num font-outlier hover:underline">
                          #{r.run_id}
                        </Link>
                      </TD>
                      <TD className="num text-right font-outlier">{formatPercent(r.probability)}</TD>
                      <TD><RunStatusBadge status={r.failed ? "failed" : "passed"} /></TD>
                      <TD className="num font-outlier text-ink-2">{formatDateTime(r.predicted_at)}</TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          </div>
        )}
      </DataState>
    </>
  );
}
