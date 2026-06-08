import { useMemo } from 'react';
import { useAuthStore } from '@/features/auth';
import { useDriverById, useDriverHOS } from './use-drivers';
import { useLoadById } from '@/features/fleet/loads/hooks/use-loads';
import type { LoadStop } from '@/features/fleet/loads/types';
import { LoadStopStatusSchema } from '@sally/shared-types';

const STOP_STATUS = LoadStopStatusSchema.enum;

export interface UpcomingLoad {
  loadNumber?: string;
  referenceNumber?: string | null;
  status: string;
  customerName?: string;
  originCity?: string | null;
  originState?: string | null;
  destinationCity?: string | null;
  destinationState?: string | null;
  /** Human trip number (TRIP-…) when this load is part of a multi-load trip. */
  tripId?: string | null;
  tripOrder?: number | null;
}

/** A driver's active work grouped as one multi-load trip, in sequence. */
export interface DriverTrip {
  tripId: string;
  loadCount: number;
  /** Loads in trip order; `isCurrent` marks the one the driver is working now. */
  loads: Array<UpcomingLoad & { isCurrent: boolean }>;
}

export function useDriverHome() {
  const { user } = useAuthStore();
  const driverId = user?.driverId ?? '';

  const { data: driver, isLoading: isDriverLoading } = useDriverById(driverId);
  const { data: hos, isLoading: isHosLoading } = useDriverHOS(driverId);

  const currentLoadId = driver?.currentLoad?.loadNumber ?? '';
  const { data: currentLoad, isLoading: isLoadLoading } = useLoadById(currentLoadId);

  // Upcoming loads from the driver endpoint (already priority-sorted by backend)
  const upcomingLoads: UpcomingLoad[] = useMemo(() => driver?.upcomingLoads ?? [], [driver]);

  const { nextStop, completedStops, totalStops } = useMemo(() => {
    if (!currentLoad?.stops?.length) {
      return { nextStop: undefined, completedStops: 0, totalStops: 0 };
    }

    const sorted = [...currentLoad.stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    const completed = sorted.filter((s) => s.status === STOP_STATUS.COMPLETED).length;
    const next = sorted.find((s) => s.status !== STOP_STATUS.COMPLETED) as LoadStop | undefined;

    return {
      nextStop: next,
      completedStops: completed,
      totalStops: sorted.length,
    };
  }, [currentLoad]);

  // Group the driver's active loads into a single multi-load trip when they
  // share a tripId — so the UI can show "Trip · N loads" in sequence rather
  // than disconnected loads. The current load is the one being worked now.
  const trip: DriverTrip | null = useMemo(() => {
    const currentTripId = currentLoad?.tripId ?? null;
    const currentEntry: UpcomingLoad | null = currentLoad
      ? {
          loadNumber: currentLoad.loadNumber,
          referenceNumber: currentLoad.referenceNumber,
          status: currentLoad.status,
          customerName: currentLoad.customerName ?? undefined,
          originCity: currentLoad.originCity,
          originState: currentLoad.originState,
          destinationCity: currentLoad.destinationCity,
          destinationState: currentLoad.destinationState,
          tripId: currentLoad.tripId,
          tripOrder: currentLoad.tripOrder,
        }
      : null;

    // Collect every active load that shares the current load's trip.
    const tripId = currentTripId ?? upcomingLoads.find((l) => l.tripId)?.tripId ?? null;
    if (!tripId) return null;

    const members = [
      ...(currentEntry && currentEntry.tripId === tripId ? [{ ...currentEntry, isCurrent: true }] : []),
      ...upcomingLoads.filter((l) => l.tripId === tripId).map((l) => ({ ...l, isCurrent: false })),
    ];
    if (members.length < 2) return null; // a trip is 2+ loads; otherwise it's a solo load

    members.sort((a, b) => (a.tripOrder ?? 0) - (b.tripOrder ?? 0));
    return { tripId, loadCount: members.length, loads: members };
  }, [currentLoad, upcomingLoads]);

  return {
    driver,
    hos,
    currentLoad,
    nextStop,
    completedStops,
    totalStops,
    upcomingLoads,
    trip,
    isLoading: isDriverLoading || isHosLoading || (!!currentLoadId && isLoadLoading),
    driverId,
  };
}
