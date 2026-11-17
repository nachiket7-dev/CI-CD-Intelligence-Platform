import { useState } from "react";

import { LineChart } from "@/components/charts/LineChart";
import { GateChecks } from "@/components/domain/GateChecks";
import { PredictionTrail } from "@/components/domain/PredictionTrail";
import { RiskCell } from "@/components/domain/RiskCell";
import { RiskReading } from "@/components/domain/RiskReading";
import { SignalList } from "@/components/domain/SignalList";
import { Badge, ModelStatusBadge, RunStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/DataState";
import { SelectField } from "@/components/ui/Field";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Stat, StatRow } from "@/components/ui/Stat";
import { Table, TD, TH } from "@/components/ui/Table";
import type { RunDetail } from "@/lib/types";

/**
 * Living style guide at /design (development only). Build or change a component here first, in every
 * state, then use it on a screen. Point coding tools at this page and at DESIGN.md.
 */

const SWATCHES: { token: string; role: string }[] = [
  { token: "paper", role: "Ground" },
  { token: "paper-2", role: "Panels" },
  { token: "paper-3", role: "Deepest step: code, tracks, hover" },
  { token: "ink", role: "Text" },
  { token: "ink-2", role: "Secondary text" },
  { token: "muted", role: "Labels and captions" },
  { token: "rule", role: "Hairlines" },
  { token: "rule-2", role: "Selected spine, strong hairline" },
  { token: "accent", role: "A person's action or selection" },
  { token: "accent-soft", role: "Selected background" },
  { token: "cool", role: "What the model measured" },
  { token: "cool-soft", role: "Model badge background" },
  { token: "ok", role: "Passed, lowers risk" },
  { token: "bad", role: "Failed, raises risk" },
];

const SAMPLE: RunDetail = {
  id: 128, repo: "risky-deps", workflow_name: "integration-tests", trigger_type: "pull_request", author: "dev-03",
  files_changed: 9, lines_changed: 412, touches_dependencies: true, touches_ci_config: false, queue_depth_at_start: 4,
  started_at: "2026-02-10T09:12:00", status: "failed", risk: 0.64, model_version: "v001-hist_gb",
  prediction: {
    id: 1, probability: 0.64, model_version: "v001-hist_gb", predicted_at: "2026-11-01T10:00:00",
    signals: [
      { feature: "touches_dependencies", value: 1, typical: 0, effect: 0.21 },
      { feature: "lines_changed", value: 412, typical: 52, effect: 0.12 },
      { feature: "queue_depth_at_start", value: 4, typical: 5, effect: -0.02 },
    ],
    features: {},
  },
  outcome: { failed: true, duration_s: 540, finished_at: "2026-02-10T09:21:00", recorded_at: "2026-11-01T10:05:00" },
  trail: [
    { kind: "started", label: "Run started", at: "2026-02-10T09:12:00", clock: "simulated" },
    { kind: "scored", label: "Risk scored before the run finished", at: "2026-11-01T10:00:00", clock: "system" },
    { kind: "finished", label: "Run failed", at: "2026-02-10T09:21:00", clock: "simulated" },
    { kind: "recorded", label: "Outcome recorded", at: "2026-11-01T10:05:00", clock: "system" },
  ],
  predicted_before_outcome: true,
};

const curve = (top: number, power: number) =>
  Array.from({ length: 21 }, (_, i) => ({ x: i / 20, y: 0.19 + (top - 0.19) * Math.pow(1 - i / 20, power) }));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Panel title={title}>{children}</Panel>;
}

export function DesignSystemPage() {
  const [tab, setTab] = useState("all");
  return (
    <>
      <PageHeader title="Design system" description="Every component in every state, with the tokens behind them. Sample data only." />
      <div className="space-y-6">
        <Section title="Colour tokens">
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {SWATCHES.map((s) => (
              <li key={s.token} className="flex items-center gap-3">
                <span aria-hidden="true" className="size-9 shrink-0 rounded-pill border border-rule-2" style={{ backgroundColor: `var(--color-${s.token})` }} />
                <span className="min-w-0">
                  <span className="num block font-outlier text-sm text-ink">--color-{s.token}</span>
                  <span className="block text-sm text-muted">{s.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Type">
          <div className="space-y-3">
            <h1>Page title in Host Grotesk</h1>
            <h2>Panel title</h2>
            <h3>Small heading</h3>
            <p className="text-ink-2">Body text at 16 pixels, in a measure under 65 characters so lines stay easy to read.</p>
            <p className="text-sm text-muted">Label or caption, one step smaller, sentence case, never capitals.</p>
            <p className="num font-outlier text-2xl text-cool">0.349 and 64% in the measured face</p>
          </div>
        </Section>

        <Section title="Controls">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="quiet">Quiet</Button>
            <Button disabled>Disabled</Button>
            <Button busy>Working</Button>
            <SelectField label="Candidate" name="ds-candidate" options={[{ value: "a", label: "Gradient boosting" }, { value: "b", label: "Random forest" }]} />
          </div>
          <div className="mt-4">
            <FilterTabs label="Example filter" value={tab} onChange={setTab} options={[{ value: "all", label: "All", count: 54 }, { value: "failed", label: "Failed", count: 11 }, { value: "passed", label: "Passed", count: 37 }]} />
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <RunStatusBadge status="pending" /><RunStatusBadge status="passed" /><RunStatusBadge status="failed" />
            <ModelStatusBadge status="active" /><ModelStatusBadge status="candidate" /><ModelStatusBadge status="rejected" /><ModelStatusBadge status="retired" />
            <Badge>Neutral</Badge>
          </div>
        </Section>

        <Section title="Stats and risk readings">
          <StatRow>
            <Stat label="PR-AUC" value="0.349" tone="cool" note="Test period" />
            <Stat label="Runs" value="2,400" />
            <Stat label="Passed" value="1,950" tone="ok" />
            <Stat label="Failed" value="450" tone="bad" />
          </StatRow>
          <div className="mt-5 space-y-2">
            <RiskCell risk={0.04} /><RiskCell risk={0.27} /><RiskCell risk={0.64} /><RiskCell risk={null} />
          </div>
          <div className="mt-6"><RiskReading run={SAMPLE} /></div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Signals"><SignalList signals={SAMPLE.prediction!.signals} /></Panel>
          <Panel title="Trail"><PredictionTrail run={SAMPLE} /></Panel>
        </div>

        <Section title="Charts">
          <div className="grid gap-6 lg:grid-cols-2">
            <LineChart title="Sample precision and recall" xLabel="Recall" yLabel="Precision" series={[
              { name: "Majority class", tone: "faint", points: curve(0.19, 0) },
              { name: "Logistic regression", tone: "muted", points: curve(0.6, 3.2) },
              { name: "Candidate", tone: "cool", points: curve(0.66, 3) },
            ]} />
            <LineChart title="Sample calibration" xLabel="Predicted" yLabel="Observed" diagonal series={[
              { name: "Candidate", tone: "cool", markers: true, points: [0.06, 0.12, 0.18, 0.25, 0.33, 0.45].map((p) => ({ x: p, y: p * 1.08 })) },
            ]} />
          </div>
        </Section>

        <Section title="Gate checks">
          <GateChecks checks={[
            { name: "beats_baseline_pr_auc", passed: true, detail: "Candidate PR-AUC 0.349 vs best baseline 0.341: gain +0.008, required +0.010." },
            { name: "brier_not_worse", passed: true, detail: "Candidate Brier 0.1450 vs best baseline 0.1480." },
            { name: "leakage_contract", passed: false, detail: "Contract violations: 'duration_s' is only known after the run." },
          ]} />
        </Section>

        <Section title="Table">
          <Table caption="Sample table">
            <thead><tr><TH>Run</TH><TH className="text-right">Lines</TH><TH>Status</TH></tr></thead>
            <tbody>
              <tr><TD>#128 integration-tests</TD><TD className="num text-right font-outlier">412</TD><TD><RunStatusBadge status="failed" /></TD></tr>
              <tr><TD>#129 build</TD><TD className="num text-right font-outlier">38</TD><TD><RunStatusBadge status="passed" /></TD></tr>
            </tbody>
          </Table>
        </Section>

        <Section title="The four data states">
          <p className="mb-4 text-sm text-muted">Every region that loads data draws all four. Wrap fetches in DataState.</p>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div><h3 className="mb-2">Loading</h3><SkeletonRows rows={4} /></div>
            <div><h3 className="mb-2">Empty</h3><EmptyState title="No runs yet" body="Generate a simulated dataset to get started." action={<Button variant="primary">Generate dataset</Button>} /></div>
            <div><h3 className="mb-2">Error</h3><ErrorState error={new Error("Cannot reach the backend. Start it with uvicorn.")} onRetry={() => undefined} /></div>
            <div><h3 className="mb-2">Full</h3><p className="text-ink-2">The real content, as on the Runs page.</p></div>
          </div>
        </Section>
      </div>
    </>
  );
}
