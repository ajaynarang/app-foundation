'use client';

import { Suspense, useMemo } from 'react';
import { Timer } from 'lucide-react';
import {
  DEADLINE_LIST_SORTS,
  DEADLINE_STATES,
  DEFAULT_DEADLINE_LIST_SORT,
  type DeadlineListSort,
  type DeadlineState,
} from '@app/shared-types';
import { Button } from '@app/ui/components/ui/button';
import {
  ANY_FILTER_VALUE,
  ListErrorState,
  ListFilterRow,
  ListFooter,
  PageEmptyState,
  PageHeader,
  PageLoadingSkeleton,
  StatusPivot,
  resolveOptionFilter,
  segmentCounts,
  toggleNamedSort,
  useListParams,
  type ListParamsConfig,
  type StatusPivotSegment,
} from '@/shared/components/page-chrome';
import { SortButton, type SortOption } from '@app/ui/components/ui/sort-button';

import { useDeadlineKinds, useDeadlineList } from '../hooks';
import { DurabilityHealthStrip } from './DurabilityHealthStrip';
import { TimersTable } from './TimersTable';

const ALL = 'ALL' as const;
type PivotValue = typeof ALL | DeadlineState;
type TimerFilter = 'kind' | 'tenant';

const PIVOT_SEGMENTS: StatusPivotSegment<PivotValue>[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILING', label: 'Failing' },
  { value: 'FIRED', label: 'Fired' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: ALL, label: 'All', dividerBefore: true },
];
const STATES_BY_PIVOT: Record<PivotValue, DeadlineState[] | undefined> = {
  PENDING: ['PENDING'],
  FAILING: ['FAILING'],
  FIRED: ['FIRED'],
  CANCELLED: ['CANCELLED'],
  [ALL]: undefined,
};

/** Opens on what the system is waiting for; kind and tenant are open vocabularies the server knows. */
const LIST_CONFIG: ListParamsConfig<PivotValue, DeadlineListSort, TimerFilter> = {
  statuses: PIVOT_SEGMENTS.map((segment) => segment.value),
  defaultStatus: 'PENDING',
  sorts: DEADLINE_LIST_SORTS,
  defaultSort: DEFAULT_DEADLINE_LIST_SORT,
  filters: { kind: ANY_FILTER_VALUE, tenant: ANY_FILTER_VALUE },
};

const SORT_OPTIONS: (SortOption & { value: DeadlineListSort })[] = [
  { value: 'soonest', label: 'Due soonest' },
  { value: 'latest', label: 'Due latest' },
];
const SORT_ORDER: Record<DeadlineListSort, 'asc' | 'desc'> = { soonest: 'asc', latest: 'desc' };
const SORT_OPPOSITE: Record<DeadlineListSort, DeadlineListSort> = { soonest: 'latest', latest: 'soonest' };

/** Super-admin Timers — every deadline row across tenants, on the list kit. */
export function TimersPage() {
  return (
    <Suspense fallback={<PageLoadingSkeleton variant="table" />}>
      <TimersPageInner />
    </Suspense>
  );
}

function TimersPageInner() {
  const list = useListParams(LIST_CONFIG);
  const kindsQuery = useDeadlineKinds();
  const kindFilter = resolveOptionFilter(list.filters.kind, kindsQuery.data, kindsQuery.isError);
  const kindOptions = useMemo(
    () => (kindsQuery.data ?? []).map((kind) => ({ value: kind, label: kind })),
    [kindsQuery.data],
  );
  // A tenant is linked from a row ("Only this tenant"); the slug is checked by the server, so an unknown one is an empty list.
  const tenant = list.filters.tenant;
  const tenantOptions = useMemo(() => (tenant ? [{ value: tenant, label: tenant }] : []), [tenant]);

  const query = useMemo(
    () => ({ states: STATES_BY_PIVOT[list.status], kind: kindFilter.value, tenant, sort: list.sort }),
    [list.status, kindFilter.value, tenant, list.sort],
  );
  const deadlines = useDeadlineList(query, { enabled: !kindFilter.holdList });
  const pivotCounts = useMemo(
    () => segmentCounts(deadlines.counts, STATES_BY_PIVOT, DEADLINE_STATES),
    [deadlines.counts],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Timers" subtitle="Every deadline the platform is holding — and whether it fired" />
      <DurabilityHealthStrip />

      <div className="space-y-4">
        <ListFilterRow
          pivot={
            <StatusPivot
              segments={PIVOT_SEGMENTS}
              value={list.status}
              onChange={list.setStatus}
              counts={pivotCounts}
              label="Deadline state"
            />
          }
          filters={[
            {
              key: 'kind',
              label: 'Kind',
              allLabel: 'All kinds',
              options: kindOptions,
              value: kindFilter.value,
              onChange: (value) => list.setFilter('kind', value),
            },
            {
              key: 'tenant',
              label: 'Tenant',
              allLabel: 'All tenants',
              options: tenantOptions,
              value: tenant,
              onChange: (value) => list.setFilter('tenant', value),
            },
          ]}
          canClear={list.isFiltered}
          onClear={list.clear}
        >
          <SortButton
            options={SORT_OPTIONS}
            sortBy={list.sort}
            sortOrder={SORT_ORDER[list.sort]}
            onSortChange={(value) => list.setSort(toggleNamedSort(list.sort, value as DeadlineListSort, SORT_OPPOSITE))}
          />
        </ListFilterRow>

        {kindFilter.status === 'error' ? (
          <ListErrorState
            title="Couldn't load the deadline kinds this list is filtered by."
            error={kindsQuery.error}
            onRetry={() => kindsQuery.refetch()}
            isRetrying={kindsQuery.isRefetching}
          />
        ) : deadlines.isLoading || kindFilter.status === 'loading' ? (
          <PageLoadingSkeleton variant="table" rows={8} />
        ) : deadlines.isError ? (
          <ListErrorState
            title="Couldn't load the timers."
            error={deadlines.error}
            onRetry={() => deadlines.refetch()}
            isRetrying={deadlines.isRefetching}
          />
        ) : deadlines.items.length === 0 ? (
          <PageEmptyState
            icon={Timer}
            title={list.isFiltered || list.status !== 'PENDING' ? 'No timers in this view' : 'Nothing is waiting'}
            description={
              list.isFiltered
                ? 'No deadline fits the kind and tenant you picked.'
                : 'Timers appear here when a change schedules one — a reminder, an expiry, a follow-up.'
            }
            action={
              list.isFiltered ? (
                <Button variant="outline" size="sm" onClick={list.clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            <TimersTable
              deadlines={deadlines.items}
              isRefreshing={deadlines.isRefreshing}
              onOnlyTenant={(slug) => list.setFilter('tenant', slug)}
              onOnlyKind={(kind) => list.setFilter('kind', kind)}
            />
            <ListFooter
              shown={deadlines.items.length}
              total={deadlines.total}
              hasMore={deadlines.hasMore}
              onLoadMore={deadlines.loadMore}
              isLoadingMore={deadlines.isLoadingMore}
              loadMoreFailed={deadlines.isLoadMoreError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
