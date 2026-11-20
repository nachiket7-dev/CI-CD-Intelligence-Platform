import type { UseQueryResult } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataState, EmptyState } from "@/components/ui/DataState";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Table, TD, TH } from "@/components/ui/Table";
import { featureLabel, formatDateTime, formatDecimal, formatPercent } from "@/lib/format";
import type { DriftReport, DriftStatus } from "@/lib/types";

export function DriftStatusBadge({ status }: { status: DriftStatus }) {
  const toneMap: Record<DriftStatus, "ok" | "person" | "bad"> = {
    stable: "ok",
    watch: "person",
    shifted: "bad",
  };
  const labelMap: Record<DriftStatus, string> = {
    stable: "Stable",
    watch: "Watch",
    shifted: "Shifted",
  };
  return <Badge tone={toneMap[status]}>{labelMap[status]}</Badge>;
}

export function DriftTable({ report }: { report: DriftReport }) {
  return (
    <>
      <div className="mb-4 rounded-card border border-rule bg-paper p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink">
              {report.model_version ? `Model ${report.model_version}` : "Active model"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>
                Reference window: {formatDateTime(report.reference_window.from)} to{" "}
                {formatDateTime(report.reference_window.to)} (
                <span className="num font-outlier">{report.n_reference.toLocaleString()}</span> runs)
              </span>
              <span>
                Live window: {formatDateTime(report.live_window.from)} to{" "}
                {formatDateTime(report.live_window.to)} (
                <span className="num font-outlier">{report.n_live.toLocaleString()}</span> runs)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Overall status</span>
            <DriftStatusBadge status={report.overall_status} />
          </div>
        </div>
      </div>

      <Table caption="Numeric feature drift comparing training window to recent live runs, sorted by PSI">
        <thead>
          <tr>
            <TH>Feature</TH>
            <TH className="text-right">PSI</TH>
            <TH className="text-right">KS statistic</TH>
            <TH className="text-right">Reference mean</TH>
            <TH className="text-right">Live mean</TH>
            <TH>Status</TH>
            <TH>What to do about it</TH>
          </tr>
        </thead>
        <tbody>
          {report.numeric_features.map((row) => (
            <tr key={row.feature}>
              <TD className="font-medium text-ink">{featureLabel(row.feature)}</TD>
              <TD className="num text-right font-outlier">{formatDecimal(row.psi, 3)}</TD>
              <TD className="num text-right font-outlier">
                {formatDecimal(row.ks_statistic, 3)}
                <span className="ml-1 text-xs text-muted">(p={formatDecimal(row.ks_pvalue, 3)})</span>
              </TD>
              <TD className="num text-right font-outlier text-ink-2">{formatDecimal(row.reference_mean, 2)}</TD>
              <TD className="num text-right font-outlier text-ink">{formatDecimal(row.live_mean, 2)}</TD>
              <TD>
                <DriftStatusBadge status={row.status} />
              </TD>
              <TD className="text-sm text-muted">{row.recommendation}</TD>
            </tr>
          ))}
        </tbody>
      </Table>

      {report.categorical_features.length > 0 && (
        <div className="mt-8 border-t border-rule pt-6">
          <h3 className="mb-2 text-sm font-medium text-ink">Categorical feature share breakdown</h3>
          <p className="mb-4 text-sm text-muted">
            Proportion of categories in the training window compared against recent live runs.
          </p>
          <div className="space-y-6">
            {report.categorical_features.map((catRow) => (
              <div key={catRow.feature} className="rounded-card border border-rule bg-paper p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{featureLabel(catRow.feature)}</span>
                    <span className="text-sm text-muted">
                      PSI <span className="num font-outlier">{formatDecimal(catRow.psi, 3)}</span>
                    </span>
                  </div>
                  <DriftStatusBadge status={catRow.status} />
                </div>
                <Table caption={`Category proportions for ${catRow.feature}`}>
                  <thead>
                    <tr>
                      <TH>Category</TH>
                      <TH className="text-right">Reference share</TH>
                      <TH className="text-right">Live share</TH>
                      <TH className="text-right">Change</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {catRow.shares.map((share) => {
                      const prefix = share.delta > 0 ? "+" : "";
                      return (
                        <tr key={share.category}>
                          <TD className="text-ink">{share.category}</TD>
                          <TD className="num text-right font-outlier">
                            {formatPercent(share.reference_share, 1)}
                            <span className="ml-1 text-xs text-muted">({share.reference_count})</span>
                          </TD>
                          <TD className="num text-right font-outlier">
                            {formatPercent(share.live_share, 1)}
                            <span className="ml-1 text-xs text-muted">({share.live_count})</span>
                          </TD>
                          <TD
                            className={`num text-right font-outlier ${
                              Math.abs(share.delta) > 0.1 ? "text-accent" : "text-muted"
                            }`}
                          >
                            {prefix}
                            {formatPercent(share.delta, 1)}
                          </TD>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface DriftPanelProps {
  query?: UseQueryResult<DriftReport | null, Error>;
  report?: DriftReport | null;
  onSimulateLive?: () => void;
  onSimulateDrift?: () => void;
  isSimulating?: boolean;
}

export function DriftPanel({
  query,
  report,
  onSimulateLive,
  onSimulateDrift,
  isSimulating,
}: DriftPanelProps) {
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" busy={isSimulating} onClick={onSimulateLive}>
        Add live runs
      </Button>
      <Button type="button" variant="primary" busy={isSimulating} onClick={onSimulateDrift}>
        Simulate drift
      </Button>
    </div>
  );

  if (query) {
    return (
      <Panel
        title="Distribution drift"
        description="Population Stability Index and Kolmogorov-Smirnov test per numeric feature, comparing training to live runs."
        action={query.data ? actions : undefined}
      >
        <DataState
          query={query}
          skeleton={<SkeletonRows rows={6} label="Loading data drift report" />}
          isEmpty={(d) => d === null}
          empty={
            <EmptyState
              title="No live runs to compare"
              body="The model training window has no subsequent live runs yet. Add live runs or introduce drift to observe feature stability."
              action={actions}
            />
          }
        >
          {(data) => (data ? <DriftTable report={data} /> : null)}
        </DataState>
      </Panel>
    );
  }

  return (
    <Panel
      title="Distribution drift"
      description="Population Stability Index and Kolmogorov-Smirnov test per numeric feature, comparing training to live runs."
      action={report ? actions : undefined}
    >
      {report ? (
        <DriftTable report={report} />
      ) : (
        <EmptyState
          title="No live runs to compare"
          body="The model training window has no subsequent live runs yet. Add live runs or introduce drift to observe feature stability."
          action={actions}
        />
      )}
    </Panel>
  );
}
