'use client';

import { useMemo } from 'react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { WireItem as WireItemType } from '@sally/shared-types';
import { WireItem } from './wire-item';
import { WireGroupRow } from './wire-group-row';
import { coalesceWire, isCoalescedGroup } from '../../utils/wire-coalesce';

interface WireListProps {
  items: WireItemType[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Plain (non-virtualized) wire list. Wire rarely exceeds 50 items in the
 * 30-minute backfill window; virtualization lands with Phase 5 stress
 * testing.
 *
 * SSE storms — >=3 same-kind items inside a 10s window — collapse into a
 * single expandable group row via `coalesceWire`.
 */
export function WireList({ items, isLoading, isError }: WireListProps) {
  const rows = useMemo(() => coalesceWire(items), [items]);

  if (isLoading) {
    return (
      <div className="space-y-2 px-3 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Couldn&apos;t load the wire.</p>;
  }
  if (rows.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">All quiet.</p>;
  }
  return (
    <ul className="space-y-2 px-3 py-3">
      {rows.map((row) =>
        isCoalescedGroup(row) ? (
          <li key={row.id}>
            <WireGroupRow group={row} />
          </li>
        ) : (
          <li key={row.id}>
            <WireItem item={row} />
          </li>
        ),
      )}
    </ul>
  );
}
