import { cn } from "@/lib/cn";
import type { GateCheck } from "@/lib/types";

const TITLES: Record<string, string> = {
  beats_baseline_pr_auc: "Beats the best baseline on PR-AUC",
  brier_not_worse: "Probabilities are no worse calibrated",
  leakage_contract: "Uses only information known before the run",
};

export function GateChecks({ checks }: { checks: GateCheck[] }) {
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {checks.map((c) => (
        <li key={c.name} className="flex gap-3">
          <span className={cn("mt-0.5 w-14 shrink-0 text-sm font-medium", c.passed ? "text-ok" : "text-bad")}>{c.passed ? "Passed" : "Failed"}</span>
          <div className="min-w-0">
            <p className="text-ink">{TITLES[c.name] ?? c.name}</p>
            <p className="text-sm text-muted">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
