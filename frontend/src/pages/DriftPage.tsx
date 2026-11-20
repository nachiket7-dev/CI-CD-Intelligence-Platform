import { DriftPanel } from "@/components/domain/DriftPanel";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useDrift, useLiveRuns } from "@/lib/hooks";

export function DriftPage() {
  const drift = useDrift();
  const liveRuns = useLiveRuns();

  return (
    <>
      <PageHeader
        title="Data drift"
        description="Compare the training window against recent live runs to detect distribution shift in model inputs."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              busy={liveRuns.isPending}
              onClick={() => liveRuns.mutate({ count: 25, drift: false })}
            >
              Add live runs
            </Button>
            <Button
              type="button"
              variant="primary"
              busy={liveRuns.isPending}
              onClick={() => liveRuns.mutate({ count: 25, drift: true })}
            >
              Simulate drift
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <DriftPanel
          query={drift}
          onSimulateLive={() => liveRuns.mutate({ count: 25, drift: false })}
          onSimulateDrift={() => liveRuns.mutate({ count: 25, drift: true })}
          isSimulating={liveRuns.isPending}
        />
      </div>
    </>
  );
}
