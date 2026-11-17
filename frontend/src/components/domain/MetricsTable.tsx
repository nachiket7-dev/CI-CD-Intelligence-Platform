import { formatDecimal } from "@/lib/format";
import type { Model } from "@/lib/types";
import { Table, TD, TH } from "../ui/Table";

/** Baselines against the candidate, on the held-out test period. */
export function MetricsTable({ metrics, precisionTarget }: { metrics: Model["metrics"]; precisionTarget: number }) {
  const rows = [
    { key: "majority", name: "Majority-class baseline" },
    { key: "logreg", name: "Logistic regression baseline" },
    { key: "candidate", name: "Candidate" },
  ] as const;
  return (
    <Table caption="Test-set scores for the baselines and the candidate">
      <thead>
        <tr>
          <TH>Model</TH>
          <TH className="text-right">PR-AUC</TH>
          <TH className="text-right">Recall at {Math.round(precisionTarget * 100)}% precision</TH>
          <TH className="text-right">Brier score</TH>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, name }) => {
          const m = metrics[key];
          return (
            <tr key={key}>
              <TD className={key === "candidate" ? "text-ink" : "text-ink-2"}>{name}</TD>
              <TD className="num text-right font-outlier">{formatDecimal(m.pr_auc)}</TD>
              <TD className="num text-right font-outlier">{m.recall_at_precision === null ? "not reached" : formatDecimal(m.recall_at_precision)}</TD>
              <TD className="num text-right font-outlier">{formatDecimal(m.brier, 4)}</TD>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
