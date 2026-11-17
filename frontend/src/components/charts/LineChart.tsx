import { cn } from "@/lib/cn";

type Tone = "cool" | "muted" | "faint";

export interface Series {
  name: string;
  points: { x: number; y: number }[];
  tone: Tone;
  /** Draw a dot at every point. Use for sparse data such as reliability bins. */
  markers?: boolean;
}

const STROKE: Record<Tone, string> = { cool: "stroke-cool", muted: "stroke-muted", faint: "stroke-rule-2" };
const FILL: Record<Tone, string> = { cool: "fill-cool", muted: "fill-muted", faint: "fill-rule-2" };
const SWATCH: Record<Tone, string> = { cool: "bg-cool", muted: "bg-muted", faint: "bg-rule-2" };

interface Props {
  title: string;
  series: Series[];
  xLabel: string;
  yLabel: string;
  /** Draw the y = x reference line, for calibration charts. */
  diagonal?: boolean;
}

const W = 520;
const H = 300;
const M = { l: 48, r: 12, t: 12, b: 40 };
const TICKS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Hand-written SVG, no chart library. Hallmark data-viz rules: one y-axis, zero baseline, hairline
 * grid, one loud series (cool) with the rest neutral, text never wears a data colour.
 */
export function LineChart({ title, series, xLabel, yLabel, diagonal }: Props) {
  const x = (v: number) => M.l + v * (W - M.l - M.r);
  const y = (v: number) => H - M.b - v * (H - M.t - M.b);
  const path = (pts: Series["points"]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full">
        <title>{title}</title>
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="stroke-rule" strokeWidth={1} />
            <text x={M.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="num fill-muted font-outlier text-xs">
              {Math.round(t * 100)}%
            </text>
            <text x={x(t)} y={H - M.b + 18} textAnchor="middle" className="num fill-muted font-outlier text-xs">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {diagonal && <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="stroke-rule-2" strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.name}>
            <path d={path(s.points)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={STROKE[s.tone]} />
            {s.markers && s.points.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r={3.5} className={FILL[s.tone]} />)}
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" className="fill-muted text-xs">{xLabel}</text>
        <text transform={`translate(12 ${(H - M.b + M.t) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted text-xs">{yLabel}</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("inline-block h-0.5 w-4", SWATCH[s.tone])} />
            {s.name}
          </span>
        ))}
        {diagonal && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-rule-2" />
            Perfectly calibrated
          </span>
        )}
      </figcaption>
    </figure>
  );
}
