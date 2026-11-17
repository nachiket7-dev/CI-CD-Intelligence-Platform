import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80",
  secondary: "border border-rule-2 text-ink hover:bg-paper-3 active:bg-paper",
  quiet: "text-ink-2 hover:bg-paper-3 hover:text-ink active:bg-paper",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** True while the action it starts is running: disables the button and announces it. */
  busy?: boolean;
}

/** One filled primary per screen. Secondary is outlined, quiet is text only. 36px high, 44px on touch. */
export function Button({ variant = "secondary", busy, className, children, disabled, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-pill px-3.5 text-sm font-medium whitespace-nowrap pointer-coarse:h-11",
        "transition-colors duration-(--dur-micro) ease-out",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
