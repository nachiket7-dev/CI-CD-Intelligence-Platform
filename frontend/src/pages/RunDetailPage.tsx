import { Link, useParams } from "react-router-dom";

import { PredictionTrail } from "@/components/domain/PredictionTrail";
import { RiskReading } from "@/components/domain/RiskReading";
import { SignalList } from "@/components/domain/SignalList";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { featureLabel, formatDateTime, formatDuration, formatFeatureValue } from "@/lib/format";
import { useFinishRun, useHealth, useRun, useScoreRun } from "@/lib/hooks";

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="num m-0 text-right font-outlier text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RunDetailPage() {
  const id = Number(useParams().id);
  const run = useRun(id);
  const health = useHealth();
  const score = useScoreRun();
  const finish = useFinishRun();
  const error = score.error ?? finish.error;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link to="/" className="text-ink-2">Back to runs</Link>
      </p>
      <DataState query={run} skeleton={<SkeletonRows rows={5} label="Loading run" />}>
        {(r) => (
          <>
            <PageHeader
              title={`Run ${r.id}`}
              description={`${r.workflow_name} in ${r.repo}, triggered by ${r.trigger_type.replace("_", " ")} from ${r.author}.`}
              actions={
                r.status === "pending" && (
                  <>
                    {!r.prediction && (
                      <Button
                        variant="primary"
                        busy={score.isPending}
                        onClick={() => score.mutate(r.id)}
                        disabled={!health.data?.active_model}
                      >
                        Score this run
                      </Button>
                    )}
                    <Button
                      busy={finish.isPending}
                      onClick={() => finish.mutate(r.id)}
                    >
                      Finish run
                    </Button>
                  </>
                )
              }
            />
            {error && <p role="alert" aria-live="assertive" className="mb-4 text-bad">{error.message}</p>}
            {r.status === "pending" && !r.prediction && health.data && !health.data.active_model && (
              <p className="mb-4 text-ink-2">
                There is no active model to score with. <Link to="/models">Train and promote one</Link> first.
              </p>
            )}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="space-y-6">
                <Panel>
                  <RiskReading run={r} />
                </Panel>
                {r.prediction && (
                  <Panel title="Top signals" description="How much each feature moved the risk compared with a typical value. These are signals about the model, not proven causes.">
                    <SignalList signals={r.prediction.signals} />
                  </Panel>
                )}
                {r.outcome && (
                  <Panel title="Outcome">
                    <Facts
                      items={[
                        ["Result", r.outcome.failed ? "Failed" : "Passed"],
                        ["Duration", formatDuration(r.outcome.duration_s)],
                        ["Finished", formatDateTime(r.outcome.finished_at)],
                      ]}
                    />
                  </Panel>
                )}
              </div>
              <div className="space-y-6">
                <Panel title="Trail" description="What happened, in order.">
                  <PredictionTrail run={r} />
                </Panel>
                <Panel title="Known when the run started">
                  <Facts
                    items={[
                      ["Files changed", String(r.files_changed)],
                      ["Lines changed", String(r.lines_changed)],
                      ["Changes dependencies", r.touches_dependencies ? "Yes" : "No"],
                      ["Changes CI config", r.touches_ci_config ? "Yes" : "No"],
                      ["Queue depth", String(r.queue_depth_at_start)],
                    ]}
                  />
                </Panel>
                {r.prediction && (
                  <Panel title="What the model saw" description="The exact features used for the score.">
                    <Facts items={Object.entries(r.prediction.features).map(([k, v]) => [featureLabel(k), formatFeatureValue(k, v)])} />
                  </Panel>
                )}
              </div>
            </div>
          </>
        )}
      </DataState>
    </>
  );
}
