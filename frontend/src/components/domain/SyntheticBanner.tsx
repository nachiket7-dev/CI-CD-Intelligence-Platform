import { USE_MOCKS } from "@/lib/api";

/** Always visible. Every number in this product comes from a simulator, and the UI says so. */
export function SyntheticBanner() {
  return (
    <div role="note" className="border-b border-rule bg-paper-3 text-sm text-ink-2">
      <div className="container py-1.5">
        Synthetic data. Results show that the pipeline works, not that it holds on real repositories.
        {USE_MOCKS && " Mock mode: the figures below are sample data and no backend is running."}
      </div>
    </div>
  );
}
