import type { UseQueryResult } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { DataState, EmptyState } from "@/components/ui/DataState";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Table, TD, TH } from "@/components/ui/Table";
import { formatPercent, formatSpread } from "@/lib/format";
import type { SweepReport } from "@/lib/types";

export function SweepTable({ sweep }: { sweep: SweepReport }) {
  const rows = [
    { key: "majority", name: "Majority-class baseline" },
    { key: "logreg", name: "Logistic regression baseline" },
    { key: "candidate", name: `Candidate (${sweep.candidate})` },
  ] as const;

  return (
    <>
      <Table caption="Test-set scores over multiple seeds (mean ± spread)">
        <thead>
          <tr>
            <TH>Model</TH>
            <TH className="text-right">PR-AUC</TH>
            <TH className="text-right">Recall at {Math.round(sweep.precision_target * 100)}% precision</TH>
            <TH className="text-right">Brier score</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, name }) => {
            const m = sweep.metrics[key];
            return (
              <tr key={key}>
                <TD className={key === "candidate" ? "text-ink" : "text-ink-2"}>{name}</TD>
                <TD className="num text-right font-outlier">{formatSpread(m?.pr_auc, 3)}</TD>
                <TD className="num text-right font-outlier">{formatSpread(m?.recall, 3)}</TD>
                <TD className="num text-right font-outlier">{formatSpread(m?.brier, 4)}</TD>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-3 text-sm text-muted">
        Promotion gate passed on{" "}
        <span className="num font-outlier text-ink">{sweep.passed_seeds}</span> of{" "}
        <span className="num font-outlier text-ink">{sweep.seeds}</span> seeds (
        <span className="num font-outlier text-ink">{formatPercent(sweep.gate_pass_rate)}</span>).
      </p>
      {sweep.leave_one_out && sweep.leave_one_out.length > 0 && (
        <div className="mt-6 border-t border-rule pt-4">
          <h3 className="mb-1 text-sm font-medium text-ink">Generalisation: leave one scenario out</h3>
          <p className="mb-3 text-sm text-muted">
            PR-AUC when each scenario is held out in turn from training and validation (mean ± spread over seeds).
          </p>
          <Table caption="Leave-one-scenario-out PR-AUC for baselines and candidate">
            <thead>
              <tr>
                <TH>Held-out scenario</TH>
                <TH className="text-right">Majority PR-AUC</TH>
                <TH className="text-right">Logistic regression PR-AUC</TH>
                <TH className="text-right">Candidate PR-AUC</TH>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-rule-2">
                <TD className="text-ink">Normal test (all scenarios)</TD>
                <TD className="num text-right font-outlier">{formatSpread(sweep.metrics.majority?.pr_auc, 3)}</TD>
                <TD className="num text-right font-outlier">{formatSpread(sweep.metrics.logreg?.pr_auc, 3)}</TD>
                <TD className="num text-right font-outlier">{formatSpread(sweep.metrics.candidate?.pr_auc, 3)}</TD>
              </tr>
              {sweep.leave_one_out.map((row) => (
                <tr key={row.scenario}>
                  <TD className="text-ink-2">Held out: {row.scenario}</TD>
                  <TD className="num text-right font-outlier">{formatSpread(row.majority_pr_auc, 3)}</TD>
                  <TD className="num text-right font-outlier">{formatSpread(row.logreg_pr_auc, 3)}</TD>
                  <TD className="num text-right font-outlier">{formatSpread(row.candidate_pr_auc, 3)}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-sm text-muted">
            This measures robustness to a different CI environment, not real-world accuracy.
          </p>
        </div>
      )}
    </>
  );
}

interface SweepPanelProps {
  query?: UseQueryResult<SweepReport | null, Error>;
  sweep?: SweepReport | null;
  onRunSweep?: () => void;
  isBusy?: boolean;
}

export function SweepPanel({ query, sweep, onRunSweep, isBusy }: SweepPanelProps) {
  if (query) {
    return (
      <Panel
        title="Seed sweep"
        description="Test-set scores on a time-ordered split over multiple seeds (mean ± spread), evaluated in memory."
        action={
          query.data ? (
            <Button type="button" variant="secondary" busy={isBusy} onClick={onRunSweep}>
              Run sweep
            </Button>
          ) : undefined
        }
      >
        <DataState
          query={query}
          skeleton={<SkeletonRows rows={3} label="Loading seed sweep" />}
          isEmpty={(d) => d === null}
          empty={
            <EmptyState
              title="No seed sweep yet"
              body="Run an in-memory sweep across multiple seeds to compare baseline and candidate stability without database writes."
              action={
                <Button type="button" variant="primary" busy={isBusy} onClick={onRunSweep}>
                  Run sweep
                </Button>
              }
            />
          }
        >
          {(data) => (data ? <SweepTable sweep={data} /> : null)}
        </DataState>
      </Panel>
    );
  }

  return (
    <Panel
      title="Seed sweep"
      description="Test-set scores on a time-ordered split over multiple seeds (mean ± spread), evaluated in memory."
      action={
        sweep ? (
          <Button type="button" variant="secondary" busy={isBusy} onClick={onRunSweep}>
            Run sweep
          </Button>
        ) : undefined
      }
    >
      {sweep ? (
        <SweepTable sweep={sweep} />
      ) : (
        <EmptyState
          title="No seed sweep yet"
          body="Run an in-memory sweep across multiple seeds to compare baseline and candidate stability without database writes."
          action={
            <Button type="button" variant="primary" busy={isBusy} onClick={onRunSweep}>
              Run sweep
            </Button>
          }
        />
      )}
    </Panel>
  );
}
