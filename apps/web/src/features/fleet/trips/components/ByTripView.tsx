'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TripStatus } from '@sally/shared-types';
import type { TripListItem, TripStatus as TripStatusType } from '@sally/shared-types';
import { Card } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { ChevronRight, Layers, User } from 'lucide-react';

import { getTripColor } from '../utils';
import { useTrips } from '../hooks/use-trips';
import { tripsApi } from '../api';
import { queryKeys } from '@/shared/constants';

// Active = not yet delivered/cancelled. The board's grouping lens only surfaces
// trips that are still in play; COMPLETED trips live in load History.
const ACTIVE_TRIP_STATUSES: TripStatusType[] = [TripStatus.DRAFT, TripStatus.ASSIGNED, TripStatus.IN_PROGRESS];

// Fetch the active trips server-side (status set + max page) so the grouped view
// shows every in-play trip regardless of how old its loads are — never a silently
// truncated default page.
const ACTIVE_TRIP_FILTERS = {
  status: ACTIVE_TRIP_STATUSES.join(','),
  limit: 100,
  sortBy: 'createdAt' as const,
  sortOrder: 'desc' as const,
};

interface ByTripViewProps {
  /** Search string from the page filter row — narrows trips by id/driver client-side. */
  search?: string;
  onTripClick: (tripId: string) => void;
}

/**
 * By-Trip grouping view.
 *
 * Sources the authoritative trip list from the trips API (`useTrips`), NOT the
 * dispatcher board's load array — the board is capped at MAX_PAGE_LIMIT, so deriving
 * trips from it silently dropped any trip whose member loads aged out of the window.
 *
 * Each card opens the Trip summary sheet (one consistent action — no separate inline
 * expand). The sheet is the single place to view member loads, reorder, and cancel.
 * Detail is prefetched on hover so the sheet opens instantly.
 */
export function ByTripView({ search, onTripClick }: ByTripViewProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useTrips(ACTIVE_TRIP_FILTERS);

  const trips = useMemo(() => {
    const all = data?.data ?? [];
    const q = search?.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.tripId.toLowerCase().includes(q) || c.driverName?.toLowerCase().includes(q));
  }, [data, search]);

  const prefetchDetail = (tripId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.trips.detail(tripId),
      queryFn: () => tripsApi.getById(tripId),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">No active trips</p>
        <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto">
          Group 2+ loads into a trip from the Board or Table view — one driver, multiple loads in sequence. Delivered
          trips move to History.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {trips.map((trip) => (
        <TripGroupCard
          key={trip.tripId}
          trip={trip}
          onOpen={() => onTripClick(trip.tripId)}
          onHoverPrefetch={() => prefetchDetail(trip.tripId)}
        />
      ))}
    </div>
  );
}

interface TripGroupCardProps {
  trip: TripListItem;
  onOpen: () => void;
  onHoverPrefetch: () => void;
}

function TripGroupCard({ trip, onOpen, onHoverPrefetch }: TripGroupCardProps) {
  const color = getTripColor(trip.tripId);

  return (
    <Card className="overflow-hidden" style={{ borderLeftWidth: 3, borderLeftColor: color }}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open trip ${trip.tripId.replace(/^TRIP-/, '')}`}
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={onOpen}
        onMouseEnter={onHoverPrefetch}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium text-foreground text-sm">{trip.tripId.replace(/^TRIP-/, '')}</span>
            <span className="text-xs text-muted-foreground">
              {trip.loadCount} load{trip.loadCount !== 1 ? 's' : ''}
            </span>
            <Badge variant="outline" className="text-[10px] capitalize">
              {trip.status.replace(/_/g, ' ').toLowerCase()}
            </Badge>
          </div>
        </div>
        {trip.driverName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <User className="h-3 w-3" />
            {trip.driverName}
          </div>
        )}
        <span className="text-sm font-medium text-foreground shrink-0">
          ${((trip.totalRevenueCents ?? 0) / 100).toLocaleString()}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Card>
  );
}
