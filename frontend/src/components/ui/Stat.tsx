import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface StatProps {
  label: string;
  value: ReactNode;
  note?: string;
  /** "cool" marks something an instrument (the model) measured. */
  tone?: "ink" | "cool" | "ok" | "bad";
}

const TONES = { ink: "text-ink", cool: "text-cool", ok: "text-ok", bad: "text-bad" };

/** A figure and its label. Always inside a StatRow, which supplies the <dl>. */
export function Stat({ label, value, note, tone = "ink" }: StatProps) {
  return (
    <div className="min-w-0">
      <dt className="text-sm whitespace-nowrap text-muted">{label}</dt>
      <dd className={cn("num font-outlier text-2xl", TONES[tone])}>{value}</dd>
      {note && <dd className="mt-0.5 text-sm text-muted">{note}</dd>}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">{children}</dl>;
}
