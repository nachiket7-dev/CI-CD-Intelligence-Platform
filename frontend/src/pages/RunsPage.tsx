import { Link } from "react-router-dom";

import { RiskCell } from "@/components/domain/RiskCell";
import { Button } from "@/components/ui/Button";
import { DataState, EmptyState } from "@/components/ui/DataState";
import { SelectField } from "@/components/ui/Field";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RunStatusBadge } from "@/components/ui/Badge";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Table, TD, TH } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import { useLiveRuns, useRuns, useSimulate } from "@/lib/hooks";
import type { RunStatus } from "@/lib/types";
import { useUrlState } from "@/lib/useUrlState";

const PAGE_SIZE = 25;

export function RunsPage() {
  const [status, setStatus] = useUrlState("status", "all");
  const [repo, setRepo] = useUrlState("repo", "all");
  const [page, setPage] = useUrlState("page", "0");
  const offset = Number(page) * PAGE_SIZE;

  const runs = useRuns({
    status: status === "all" ? undefined : (status as RunStatus),
    repo: repo === "all" ? undefined : repo,
    limit: PAGE_SIZE,
    offset,
  });
  const simulate = useSimulate();
  const live = useLiveRuns();
  const counts = runs.data?.counts;

  const change = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (page !== "0") setPage("0");
  };

  return (
    <>
      <PageHeader
        title="Runs"
        description="Every simulated CI run, newest first. Pending runs are scored before they finish."
        actions={
          <>
            <Button onClick={() => live.mutate(5)} busy={live.isPending} disabled={!counts?.total}>
              Add 5 live runs
            </Button>
            <Button variant="primary" onClick={() => simulate.mutate()} busy={simulate.isPending}>
              Generate dataset
            </Button>
          </>
        }
      />
      {(simulate.isError || live.isError) && (
        <p role="alert" aria-live="assertive" className="mb-4 text-bad">
          {(simulate.error ?? live.error)?.message}
        </p>
      )}
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            label="Filter by status"
            value={status}
            onChange={change(setStatus)}
            options={[
              { value: "all", label: "All", count: counts?.total },
              { value: "pending", label: "Running", count: counts?.pending },
              { value: "passed", label: "Passed", count: counts?.passed },
              { value: "failed", label: "Failed", count: counts?.failed },
            ]}
          />
          <SelectField
            label="Repository"
            name="repo"
            value={repo}
            onChange={(e) => change(setRepo)(e.target.value)}
            options={[{ value: "all", label: "All repositories" }, ...(runs.data?.repos ?? []).map((r) => ({ value: r, label: r }))]}
          />
        </div>
        <DataState
          query={runs}
          skeleton={<SkeletonRows rows={8} label="Loading runs" />}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              title={counts?.total ? "No runs match these filters" : "No runs yet"}
              body={
                counts?.total
                  ? "Clear a filter to see more runs."
                  : "Generate a simulated dataset to get started. It takes a few seconds and needs no external service."
              }
              action={
                counts?.total ? (
                  <Button onClick={() => { setStatus("all"); setRepo("all"); }}>Clear filters</Button>
                ) : (
                  <Button variant="primary" onClick={() => simulate.mutate()} busy={simulate.isPending}>
                    Generate dataset
                  </Button>
                )
              }
            />
          }
        >
          {(data) => {
            const total = status === "all" ? data.counts.total : data.counts[status as RunStatus];
            return (
              <>
                {/* Narrow screens: restack each row into a labelled block (< 640px) */}
                <div className="divide-y divide-rule sm:hidden" role="feed" aria-label="CI runs list">
                  {data.items.map((r) => (
                    <article key={r.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={`/runs/${r.id}`} className="font-medium text-ink hover:underline">
                          <span className="num font-outlier">#{r.id}</span> {r.workflow_name}
                        </Link>
                        <RunStatusBadge status={r.status} />
                      </div>
                      <div className="mt-2.5 flex items-end justify-between gap-3">
                        <dl className="m-0 space-y-0.5 text-xs text-muted">
                          <div>
                            <dt className="inline text-muted">Repository: </dt>
                            <dd className="inline text-ink-2">{r.repo}</dd>
                          </div>
                          <div>
                            <dt className="inline text-muted">Changes: </dt>
                            <dd className="num inline font-outlier text-ink-2">{r.lines_changed} lines</dd>
                          </div>
                          <div>
                            <dt className="inline text-muted">Started: </dt>
                            <dd className="num inline font-outlier text-ink-2">{formatDateTime(r.started_at)}</dd>
                          </div>
                        </dl>
                        <div className="shrink-0 text-right">
                          <RiskCell risk={r.risk} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Wide screens: real semantic <table> (>= 640px) */}
                <div className="hidden sm:block">
                  <Table caption="CI runs with failure risk and outcome">
                    <thead>
                      <tr>
                        <TH>Run</TH>
                        <TH>Repository</TH>
                        <TH className="text-right">Lines changed</TH>
                        <TH>Started</TH>
                        <TH>Risk</TH>
                        <TH>Status</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((r) => (
                        <tr key={r.id}>
                          <TD>
                            <Link to={`/runs/${r.id}`} className="text-ink hover:underline">
                              <span className="num font-outlier">#{r.id}</span> {r.workflow_name}
                            </Link>
                          </TD>
                          <TD className="text-ink-2">{r.repo}</TD>
                          <TD className="num text-right font-outlier">{r.lines_changed}</TD>
                          <TD className="num font-outlier text-ink-2">{formatDateTime(r.started_at)}</TD>
                          <TD>
                            <RiskCell risk={r.risk} />
                          </TD>
                          <TD>
                            <RunStatusBadge status={r.status} />
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
                  <span className="num" aria-live="polite">
                    Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, total)} of {total}
                  </span>
                  <span className="flex gap-2">
                    <Button disabled={offset === 0} onClick={() => setPage(String(Number(page) - 1))} aria-label="Previous page">Previous</Button>
                    <Button disabled={offset + PAGE_SIZE >= total} onClick={() => setPage(String(Number(page) + 1))} aria-label="Next page">Next</Button>
                  </span>
                </div>
              </>
            );
          }}
        </DataState>
      </Panel>
    </>
  );
}
