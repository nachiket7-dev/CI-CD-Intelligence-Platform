/** Formatting helpers. Numbers shown to people are always tabular (see `.num` in base.css). */

/** The API sends naive UTC datetimes. Treat them as UTC so every viewer sees the same time. */
export function parseServerDate(iso: string): Date {
  const hasZone = /[zZ]|[+-]\d\d:\d\d$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export const formatDateTime = (iso: string) => dateTime.format(parseServerDate(iso));

export function formatPercent(p: number | null | undefined, digits = 0): string {
  if (p === null || p === undefined) return "n/a";
  return `${(p * 100).toFixed(digits)}%`;
}

export function formatDecimal(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined) return "n/a";
  return n.toFixed(digits);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

/** Signed change in failure probability, in percentage points. */
export function formatEffect(effect: number): string {
  const pts = effect * 100;
  return `${pts >= 0 ? "+" : "-"}${Math.abs(pts).toFixed(1)} pts`;
}

export const FEATURE_LABELS: Record<string, string> = {
  repo: "Repository",
  workflow_name: "Workflow",
  trigger_type: "Trigger",
  files_changed: "Files changed",
  lines_changed: "Lines changed",
  touches_dependencies: "Changes dependencies",
  touches_ci_config: "Changes CI config",
  queue_depth_at_start: "Queue depth at start",
  workflow_fail_rate_recent: "Recent workflow failure rate",
  hours_since_last_failure: "Hours since last failure",
  author_recent_fail_rate: "Author's recent failure rate",
  hour_of_day: "Hour of day",
  day_of_week: "Day of week",
};

export const featureLabel = (name: string) => FEATURE_LABELS[name] ?? name;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function formatFeatureValue(name: string, value: number | string): string {
  if (typeof value === "string") return value;
  if (name === "touches_dependencies" || name === "touches_ci_config") return value ? "Yes" : "No";
  if (name === "workflow_fail_rate_recent" || name === "author_recent_fail_rate") return formatPercent(value, 0);
  if (name === "hours_since_last_failure") return value >= 168 ? "over a week" : `${value.toFixed(1)} h`;
  if (name === "day_of_week") return DAYS[Math.round(value)] ?? String(value);
  if (name === "hour_of_day") return `${String(Math.round(value)).padStart(2, "0")}:00`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
