import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { SkeletonRows } from "./Skeleton";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <h3>{title}</h3>
      <p className="text-ink-2">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" aria-live="assertive" className="flex flex-col items-start gap-3 py-8">
      <h3 className="text-bad">This didn’t load</h3>
      <p className="max-w-[60ch] text-ink-2">{error.message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

interface Props<T> {
  query: UseQueryResult<T, Error>;
  /** Shape of what is loading. Defaults to table-like rows. */
  skeleton?: ReactNode;
  isEmpty?: (data: T) => boolean;
  /** What belongs here, and the one action that fills it. */
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * Every region that loads data has four states: loading, empty, error, full.
 * Wrap each fetch in this so none of them gets forgotten.
 */
export function DataState<T>({ query, skeleton, isEmpty, empty, children }: Props<T>) {
  if (query.isPending) return <>{skeleton ?? <SkeletonRows />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (isEmpty?.(query.data) && empty) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
