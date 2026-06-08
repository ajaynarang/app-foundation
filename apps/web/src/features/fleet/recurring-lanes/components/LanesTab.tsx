'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { Button } from '@sally/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { useRecurringLanes, useUpcomingGenerations } from '../hooks/use-recurring-lanes';
import { UpcomingGenerationsQueue } from './UpcomingGenerationsQueue';
import { LanesTable } from './LanesTable';
import {
  RecurringLaneStatus,
  RECURRING_LANE_STATUS_LABELS,
  type RecurringLane,
  type RecurringLaneFilters,
  type RecurringLaneStatusType,
} from '../types';

const ALL_STATUSES = 'all' as const;

// Derived from the canonical enum so values are always the uppercase API contract.
const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Statuses', value: ALL_STATUSES },
  ...Object.values(RecurringLaneStatus).map((value) => ({
    label: RECURRING_LANE_STATUS_LABELS[value],
    value,
  })),
];

interface LanesTabProps {
  onCreateLane?: () => void;
  onEditLane?: (lane: RecurringLane) => void;
  onViewLane?: (lane: RecurringLane) => void;
}

export function LanesTab({ onCreateLane, onEditLane, onViewLane }: LanesTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RecurringLaneStatusType | typeof ALL_STATUSES>(ALL_STATUSES);

  const filters: RecurringLaneFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
      limit: 50,
      offset: 0,
    }),
    [search, statusFilter],
  );

  const { data, isLoading, error, refetch } = useRecurringLanes(filters);
  const { data: upcomingData, isLoading: isUpcomingLoading } = useUpcomingGenerations();

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-critical mb-4">Failed to load recurring lanes.</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 space-y-6 overflow-auto">
      {/* Upcoming Generations Section */}
      <UpcomingGenerationsQueue lanes={upcomingData?.data ?? []} isLoading={isUpcomingLoading} />

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative max-w-md flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lanes, customers, routes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as RecurringLaneStatusType | typeof ALL_STATUSES)}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lanes Table */}
      <LanesTable
        lanes={data?.data ?? []}
        total={data?.total ?? 0}
        isLoading={isLoading}
        hasSearch={!!search.trim() || statusFilter !== 'all'}
        onCreateLane={onCreateLane}
        onEditLane={onEditLane}
        onViewLane={onViewLane}
      />
    </div>
  );
}
