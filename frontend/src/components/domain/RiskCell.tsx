import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { riskBand } from "@/lib/risk";

/** A risk reading in the table: the figure in the measured face, with a hairline bar for scanning. */
export function RiskCell({ risk }: { risk: number | null }) {
  if (risk === null) return <span className="text-muted">Not scored</span>;
  const { band, label } = riskBand(risk);
  return (
    <div className="flex items-center gap-3" title={label}>
      <span className="num w-10 font-outlier text-ink">{formatPercent(risk)}</span>
      <span aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-pill bg-paper-3">
        <span
          className={cn("block h-full", band === "high" ? "bg-bad" : band === "medium" ? "bg-accent" : "bg-cool")}
          style={{ width: `${Math.max(2, risk * 100)}%` }}
        />
      </span>
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
