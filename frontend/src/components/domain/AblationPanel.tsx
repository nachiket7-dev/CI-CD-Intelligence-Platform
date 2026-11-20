import type { UseQueryResult } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataState, EmptyState } from "@/components/ui/DataState";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Table, TD, TH } from "@/components/ui/Table";
import { formatDecimal, formatSpread } from "@/lib/format";
import type { AblationReport, MetricSpread } from "@/lib/types";

function formatDeltaSpread(metric: MetricSpread | null | undefined, digits = 3): string {
  if (!metric || metric.mean === null || metric.mean === undefined) return "not reached";
  const prefix = metric.mean > 0 ? "+" : "";
  return `${prefix}${formatDecimal(metric.mean, digits)} ± ${formatDecimal(metric.spread, digits)}`;
}

export function AblationTable({ ablation }: { ablation: AblationReport }) {
  const leak = ablation.deliberate_leak;

  return (
    <>
      <Table caption="Candidate PR-AUC with one feature group removed (mean ± spread over seeds)">
        <thead>
          <tr>
            <TH>Feature group</TH>
            <TH className="text-right">Candidate PR-AUC</TH>
            <TH className="text-right">Change vs full model</TH>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-rule-2">
            <TD>
              <div className="font-medium text-ink">Full candidate model</div>
              <div className="text-sm text-muted">All feature groups included</div>
            </TD>
            <TD className="num text-right font-outlier">{formatSpread(ablation.full_model_pr_auc, 3)}</TD>
            <TD className="num text-right font-outlier text-muted">baseline</TD>
          </tr>
          {ablation.groups.map((group) => (
            <tr key={group.group_id}>
              <TD>
                <div className="text-ink">Removed: {group.name}</div>
                <div className="text-sm text-muted">{group.features.join(", ")}</div>
              </TD>
              <TD className="num text-right font-outlier">{formatSpread(group.pr_auc, 3)}</TD>
              <TD className="num text-right font-outlier">{formatDeltaSpread(group.delta_pr_auc, 3)}</TD>
            </tr>
          ))}
        </tbody>
      </Table>

      {leak && (
        <div className="mt-6 border-t border-rule pt-4">
          <h3 className="mb-1 text-sm font-medium text-ink">Deliberate leak verification</h3>
          <p className="mb-3 text-sm text-muted">
            The post-run field <code className="text-ink">{leak.forbidden_field}</code> was deliberately injected into a copy of the pipeline to verify that safeguards fail loudly.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-card border border-rule bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">Feature contract check</span>
                <Badge tone={leak.contract_caught ? "ok" : "bad"}>
                  {leak.contract_caught ? "Caught loudly" : "Undetected"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {leak.contract_caught
                  ? "ContractViolation raised before training could proceed."
                  : "Contract failed to detect post-run field."}
              </p>
            </div>
            <div className="rounded-card border border-rule bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">Promotion gate</span>
                <Badge tone={leak.gate_caught && !leak.gate_passed ? "ok" : "bad"}>
                  {leak.gate_caught && !leak.gate_passed ? "Candidate rejected" : "Permitted"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {!leak.gate_passed
                  ? "Promotion gate failed on leakage_contract check."
                  : "Gate permitted model with leakage."}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface AblationPanelProps {
  query?: UseQueryResult<AblationReport | null, Error>;
  ablation?: AblationReport | null;
  onRunAblation?: () => void;
  isBusy?: boolean;
}

export function AblationPanel({ query, ablation, onRunAblation, isBusy }: AblationPanelProps) {
  if (query) {
    return (
      <Panel
        title="Feature ablation and leakage test"
        description="Candidate PR-AUC when removing one feature group at a time, and verification that deliberate leakage is caught loudly."
        action={
          query.data ? (
            <Button type="button" variant="secondary" busy={isBusy} onClick={onRunAblation}>
              Run ablation
            </Button>
          ) : undefined
        }
      >
        <DataState
          query={query}
          skeleton={<SkeletonRows rows={4} label="Loading feature ablation" />}
          isEmpty={(d) => d === null}
          empty={
            <EmptyState
              title="No ablation study yet"
              body="Retrain the candidate with feature groups removed to measure each group's impact and verify leakage defences."
              action={
                <Button type="button" variant="primary" busy={isBusy} onClick={onRunAblation}>
                  Run ablation
                </Button>
              }
            />
          }
        >
          {(data) => (data ? <AblationTable ablation={data} /> : null)}
        </DataState>
      </Panel>
    );
  }

  return (
    <Panel
      title="Feature ablation and leakage test"
      description="Candidate PR-AUC when removing one feature group at a time, and verification that deliberate leakage is caught loudly."
      action={
        ablation ? (
          <Button type="button" variant="secondary" busy={isBusy} onClick={onRunAblation}>
            Run ablation
          </Button>
        ) : undefined
      }
    >
      {ablation ? (
        <AblationTable ablation={ablation} />
      ) : (
        <EmptyState
          title="No ablation study yet"
          body="Retrain the candidate with feature groups removed to measure each group's impact and verify leakage defences."
          action={
            <Button type="button" variant="primary" busy={isBusy} onClick={onRunAblation}>
              Run ablation
            </Button>
          }
        />
      )}
    </Panel>
  );
}
