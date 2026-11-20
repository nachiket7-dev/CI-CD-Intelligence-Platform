import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface Props {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** The one container recipe: a hairline-bordered surface one step above the ground. Never nest panels. */
export function Panel({ title, description, action, children, className }: Props) {
  return (
    <section className={cn("min-w-0 max-w-full rounded-card border border-rule bg-paper-2", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-4 py-3">
          <div className="min-w-0">
            {title && <h2>{title}</h2>}
            {description && <p className="mt-1 max-w-[60ch] text-sm text-muted">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className="min-w-0 max-w-full p-4">{children}</div>
    </section>
  );
}
