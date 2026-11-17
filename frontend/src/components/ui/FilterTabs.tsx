import { cn } from "@/lib/cn";

interface Option {
  value: string;
  label: string;
  count?: number;
}

/** A short set of mutually exclusive filters. State belongs in the URL: see useUrlState. */
export function FilterTabs({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-medium transition-colors duration-(--dur-micro) pointer-coarse:h-11",
              selected ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-paper-3 hover:text-ink active:bg-paper",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="num font-outlier text-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
