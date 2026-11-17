import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { ModelStatus, RunStatus } from "@/lib/types";

type Tone = "neutral" | "ok" | "bad" | "cool" | "person";

const TONES: Record<Tone, string> = {
  neutral: "bg-paper-3 text-ink-2",
  ok: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  cool: "bg-cool-soft text-cool",
  person: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-pill px-2 py-0.5 text-sm font-medium whitespace-nowrap", TONES[tone])}>
      {children}
    </span>
  );
}

const RUN: Record<RunStatus, { tone: Tone; label: string }> = {
  pending: { tone: "neutral", label: "Running" },
  passed: { tone: "ok", label: "Passed" },
  failed: { tone: "bad", label: "Failed" },
};

export const RunStatusBadge = ({ status }: { status: RunStatus }) => (
  <Badge tone={RUN[status].tone}>{RUN[status].label}</Badge>
);

const MODEL: Record<ModelStatus, { tone: Tone; label: string }> = {
  active: { tone: "person", label: "Active" },
  candidate: { tone: "cool", label: "Ready to promote" },
  rejected: { tone: "bad", label: "Rejected" },
  retired: { tone: "neutral", label: "Retired" },
};

export const ModelStatusBadge = ({ status }: { status: ModelStatus }) => (
  <Badge tone={MODEL[status].tone}>{MODEL[status].label}</Badge>
);
