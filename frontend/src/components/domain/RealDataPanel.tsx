import type { UseQueryResult } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { DataState, EmptyState } from "@/components/ui/DataState";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Table, TD, TH } from "@/components/ui/Table";
import { formatDecimal } from "@/lib/format";
import type { RealDataReport } from "@/lib/types";

export function RealDataTable({ report }: { report: RealDataReport }) {
  const rows = [
    { key: "majority", name: "Majority-class baseline" },
    { key: "logreg", name: "Logistic regression baseline" },
    { key: "candidate", name: `Candidate (${report.candidate})` },
  ] as const;

  return (
    <>
      <div className="mb-4 rounded-card border border-rule bg-paper p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-ink">{report.dataset_name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>DOI {report.doi}</span>
              <span>Licence {report.licence}</span>
              <span>
                Evaluated rows <span className="num font-outlier">{report.total_rows.toLocaleString()}</span>
              </span>
            </div>
          </div>
          <Badge tone={report.gate.passed ? "ok" : "bad"}>
            {report.gate.passed ? "Gate passed" : "Gate rejected"}
          </Badge>
        </div>
      </div>

      <div className="mb-6 rounded-card border border-rule bg-paper-2 p-3">
        <h3 className="mb-1 text-sm font-medium text-ink">Dataset limits and unbuildable features</h3>
        <p className="mb-3 text-sm text-muted">
          Features that cannot be computed from the dataset metadata are completely omitted from the model inputs.
          They are not imputed or filled with zeros or synthetic defaults.
        </p>
        <ul className="m-0 list-none space-y-2 p-0">
          {report.missing_contract_features.map((m) => (
            <li key={m.feature} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:gap-2">
              <code className="shrink-0 font-medium text-ink">{m.feature}</code>
              <span className="text-muted">{m.reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <Table caption="Real-world GitHub Actions test scores across baselines and candidate">
        <thead>
          <tr>
            <TH>Model</TH>
            <TH className="text-right">PR-AUC</TH>
            <TH className="text-right">Recall at 50% precision</TH>
            <TH className="text-right">Brier score</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, name }) => {
            const m = report.metrics[key];
            return (
              <tr key={key}>
                <TD className={key === "candidate" ? "font-medium text-ink" : "text-ink-2"}>{name}</TD>
                <TD className="num text-right font-outlier">{formatDecimal(m.pr_auc)}</TD>
                <TD className="num text-right font-outlier">
                  {m.recall_at_precision === null ? "not reached" : formatDecimal(m.recall_at_precision)}
                </TD>
                <TD className="num text-right font-outlier">{formatDecimal(m.brier, 4)}</TD>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="mt-6 border-t border-rule pt-4">
        <h3 className="mb-2 text-sm font-medium text-ink">Gate verification on real data</h3>
        <p className="mb-3 text-sm text-muted">{report.gate.reason}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {report.gate.checks.map((check) => (
            <div key={check.name} className="rounded-card border border-rule bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{check.name}</span>
                <Badge tone={check.passed ? "ok" : "bad"}>{check.passed ? "Pass" : "Fail"}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{check.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

interface RealDataPanelProps {
  query?: UseQueryResult<RealDataReport | null, Error>;
  report?: RealDataReport | null;
}

export function RealDataPanel({ query, report }: RealDataPanelProps) {
  if (query) {
    return (
      <Panel
        title="Real data check"
        description="Evaluation against the public GitHub Actions dataset with pre-run feature isolation and promotion gating."
      >
        <DataState
          query={query}
          skeleton={<SkeletonRows rows={4} label="Loading real data check" />}
          isEmpty={(d) => d === null}
          empty={
            <EmptyState
              title="No real data check report yet"
              body="Run `python -m app.cli realdata <path>` with the Mendeley GitHub Actions dataset to evaluate the model on real data."
            />
          }
        >
          {(data) => (data ? <RealDataTable report={data} /> : null)}
        </DataState>
      </Panel>
    );
  }

  return (
    <Panel
      title="Real data check"
      description="Evaluation against the public GitHub Actions dataset with pre-run feature isolation and promotion gating."
    >
      {report ? (
        <RealDataTable report={report} />
      ) : (
        <EmptyState
          title="No real data check report yet"
          body="Run `python -m app.cli realdata <path>` with the Mendeley GitHub Actions dataset to evaluate the model on real data."
        />
      )}
    </Panel>
  );
}
