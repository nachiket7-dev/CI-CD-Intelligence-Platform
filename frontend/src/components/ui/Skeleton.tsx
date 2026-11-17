import { cn } from "@/lib/cn";

/** A block in the shape of what is loading. Pulses by opacity only, and holds still under reduced motion. */
export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden="true" className={cn("animate-pulse rounded-pill bg-paper-3", className)} />
);

export function SkeletonRows({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
