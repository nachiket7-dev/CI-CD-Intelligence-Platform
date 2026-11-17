import { useState } from "react";

import { LineChart } from "@/components/charts/LineChart";
import { GateChecks } from "@/components/domain/GateChecks";
import { MetricsTable } from "@/components/domain/MetricsTable";
import { ModelStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataState, EmptyState } from "@/components/ui/DataState";
import { SelectField } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Table, TD, TH } from "@/components/ui/Table";
import { featureLabel, formatDateTime, formatDecimal, formatPercent } from "@/lib/format";
import { useModels, usePromote, useReport, useTrain } from "@/lib/hooks";
import type { CandidateKind, Report } from "@/lib/types";
import { useUrlState } from "@/lib/useUrlState";

const CANDIDATES: { value: CandidateKind; label: string }[] = [
  { value: "hist_gb", label: "Gradient boosting" },
  { value: "random_forest", label: "Random forest" },
  { value: "weak_stump", label: "Deliberately weak (the gate should reject it)" },
];

function Importances({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values).slice(0, 8);
  const max = Math.max(0.0001, ...entries.map(([, v]) => v));
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {entries.map(([name, v]) => (
        <li key={name}>
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-ink">{featureLabel(name)}</span>
            <span className="num font-outlier text-ink-2">{formatDecimal(v, 3)}</span>
          </div>
          <div aria-hidden="true" className="mt-1 h-1 rounded-pill bg-paper-3">
            <div className="h-full rounded-pill bg-cool" style={{ width: `${Math.max(1, (v / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportView({ report }: { report: Report }) {
  const m = report.model;
  return (
    <div className="space-y-6">
      <Panel title={`Comparison for ${m.version}`} description={`Scores on the final, held-out period of ${m.n_test} runs. Training used ${m.n_train} earlier runs.`}>
        <MetricsTable metrics={m.metrics} precisionTarget={report.precision_target} />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Promotion gate" description={m.gate.passed ? "The candidate cleared every check." : "The candidate was rejected."}>
          <GateChecks checks={m.gate.checks} />
        </Panel>
        <Panel title="What drives the score" description="How much shuffling each feature hurts PR-AUC on the validation period.">
          <Importances values={m.importances} />
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Precision and recall" description="Higher and further right is better.">
          <LineChart
            title="Precision against recall for each model"
            xLabel="Recall"
            yLabel="Precision"
            series={[
              { name: "Majority class", tone: "faint", points: report.pr_curves.majority.map((p) => ({ x: p.recall, y: p.precision })) },
              { name: "Logistic regression", tone: "muted", points: report.pr_curves.logreg.map((p) => ({ x: p.recall, y: p.precision })) },
              { name: "Candidate", tone: "cool", points: report.pr_curves.candidate.map((p) => ({ x: p.recall, y: p.precision })) },
            ]}
          />
        </Panel>
        <Panel title="Calibration" description="When the model says 30%, about 30% of those runs should fail.">
          <LineChart
            title="Observed failure rate against predicted risk"
            xLabel="Predicted chance of failure"
            yLabel="Observed failure rate"
            diagonal
            series={[
              { name: "Logistic regression", tone: "muted", markers: true, points: report.reliability.logreg.map((p) => ({ x: p.mean_predicted, y: p.observed_rate })) },
              { name: "Candidate", tone: "cool", markers: true, points: report.reliability.candidate.map((p) => ({ x: p.mean_predicted, y: p.observed_rate })) },
            ]}
          />
        </Panel>
      </div>
      <Panel title="Choosing a threshold" description="Flagging more runs catches more failures and raises false alarms.">
        <Table caption="Precision, recall and share of runs flagged at each threshold">
          <thead>
            <tr>
              <TH>Flag runs at or above</TH>
              <TH className="text-right">Precision</TH>
              <TH className="text-right">Recall</TH>
              <TH className="text-right">Runs flagged</TH>
            </tr>
          </thead>
          <tbody>
            {report.thresholds.map((t) => (
              <tr key={t.threshold}>
                <TD className="num font-outlier">{formatPercent(t.threshold)}</TD>
                <TD className="num text-right font-outlier">{formatPercent(t.precision)}</TD>
                <TD className="num text-right font-outlier">{formatPercent(t.recall)}</TD>
                <TD className="num text-right font-outlier">{formatPercent(t.flagged_share)}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <Panel title="Time-ordered split" description="Training always comes before validation, which comes before the test period.">
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {(["train", "validation", "test"] as const).map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k === "train" ? "Training" : k === "validation" ? "Validation" : "Test"}</dt>
              <dd className="num m-0 text-right font-outlier text-ink-2">
                {formatDateTime(report.windows[k].from)} to {formatDateTime(report.windows[k].to)}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

export function ModelsPage() {
  const models = useModels();
  const [selected, setSelected] = useUrlState("model", "");
  const report = useReport(selected ? Number(selected) : undefined);
  const train = useTrain();
  const promote = usePromote();
  const [candidate, setCandidate] = useState<CandidateKind>("hist_gb");
  const error = train.error ?? promote.error;

  return (
    <>
      <PageHeader
        title="Models"
        description="Train a candidate, compare it with the baselines, and promote it only if it clears the gate."
        actions={
          <>
            <SelectField
              label="Candidate"
              name="candidate"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value as CandidateKind)}
              options={CANDIDATES}
            />
            <Button variant="primary" busy={train.isPending} onClick={() => train.mutate(candidate, { onSuccess: (m) => setSelected(String(m.id)) })}>
              Train and run gate
            </Button>
          </>
        }
      />
      {error && <p role="alert" className="mb-4 text-bad">{error.message}</p>}
      <div className="space-y-6">
        <Panel title="Registry">
          <DataState
            query={models}
            skeleton={<SkeletonRows rows={3} label="Loading models" />}
            isEmpty={(d) => d.length === 0}
            empty={<EmptyState title="No models yet" body="Train a candidate. It needs at least 300 finished runs, so generate a dataset first if the Runs page is empty." />}
          >
            {(list) => (
              <Table caption="Trained models and their gate result">
                <thead>
                  <tr>
                    <TH>Version</TH>
                    <TH>Status</TH>
                    <TH className="text-right">PR-AUC</TH>
                    <TH className="text-right">Brier score</TH>
                    <TH>Trained</TH>
                    <TH>
                      <span className="visually-hidden">Actions</span>
                    </TH>
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.id}>
                      <TD>
                        <button type="button" onClick={() => setSelected(String(m.id))} className="num font-outlier text-ink underline underline-offset-4">
                          {m.version}
                        </button>
                      </TD>
                      <TD>
                        <ModelStatusBadge status={m.status} />
                      </TD>
                      <TD className="num text-right font-outlier">{formatDecimal(m.metrics.candidate.pr_auc)}</TD>
                      <TD className="num text-right font-outlier">{formatDecimal(m.metrics.candidate.brier, 4)}</TD>
                      <TD className="num font-outlier text-ink-2">{formatDateTime(m.created_at)}</TD>
                      <TD className="text-right">
                        {m.status === "candidate" && (
                          <Button variant="primary" busy={promote.isPending} onClick={() => promote.mutate(m.id)}>
                            Promote
                          </Button>
                        )}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </DataState>
        </Panel>
        {models.data && models.data.length > 0 && (
          <DataState query={report} skeleton={<SkeletonRows rows={6} label="Loading report" />}>
            {(r) => <ReportView report={r} />}
          </DataState>
        )}
      </div>
    </>
  );
}
