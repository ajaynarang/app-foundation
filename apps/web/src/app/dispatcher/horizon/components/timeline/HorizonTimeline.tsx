'use client';

import { useRef, useCallback, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { HorizonResponse, SallySuggestion } from '@/features/horizon/types';
import { useReassignLoad } from '@/features/horizon/hooks/use-reassign-load';
import {
  useDeleteDriverUnavailability,
  useDeleteVehicleUnavailability,
} from '@/features/horizon/hooks/use-horizon-mutations';
import { CapacityStrip } from './CapacityStrip';
import { TimelineHeader } from './TimelineHeader';
import { TimelineDriverRow } from './TimelineDriverRow';

interface HorizonTimelineProps {
  data: HorizonResponse;
  dayStrings: string[];
  onOpenSlotClick: (driverId: number, dayStr: string) => void;
  onLoadClick?: (loadId: string) => void;
}

export function HorizonTimeline({ data, dayStrings, onOpenSlotClick, onLoadClick }: HorizonTimelineProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const reassignLoad = useReassignLoad();
  const deleteDriverUnavail = useDeleteDriverUnavailability();
  const deleteVehicleUnavail = useDeleteVehicleUnavailability();
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const suggestions = useMemo(
    () => data.sallyInsight?.suggestions.filter((s) => !dismissedSuggestions.has(s.suggestionId)) ?? [],
    [data.sallyInsight?.suggestions, dismissedSuggestions],
  );

  const handleAcceptSuggestion = useCallback(
    (suggestion: SallySuggestion) => {
      // Find the driver's string IDs from the data
      const targetDriver = data.drivers.find((d) => d.driverId === suggestion.driverId);
      if (!targetDriver?.driverStringId || !targetDriver?.vehicleStringId) return;
      reassignLoad.mutate({
        loadId: suggestion.loadNumber,
        driverId: targetDriver.driverStringId,
        vehicleId: targetDriver.vehicleStringId,
      });
      setDismissedSuggestions((prev) => new Set(prev).add(suggestion.suggestionId));
    },
    [reassignLoad, data.drivers],
  );

  const handleDismissSuggestion = useCallback((suggestionId: string) => {
    setDismissedSuggestions((prev) => new Set(prev).add(suggestionId));
  }, []);

  const useVirtual = data.drivers.length > 50;
  const rowVirtualizer = useVirtualizer({
    count: data.drivers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 3,
    enabled: useVirtual,
  });

  const renderRow = useCallback(
    (index: number) => {
      const driver = data.drivers[index];
      return (
        <TimelineDriverRow
          key={driver.driverId}
          driver={driver}
          dayStrings={dayStrings}
          suggestions={suggestions}
          onAcceptSuggestion={handleAcceptSuggestion}
          onDismissSuggestion={handleDismissSuggestion}
          onDeleteDriverUnavail={(id) => deleteDriverUnavail.mutate(id)}
          onDeleteVehicleUnavail={(id) => deleteVehicleUnavail.mutate(id)}
          onOpenSlotClick={onOpenSlotClick}
          onLoadClick={onLoadClick}
        />
      );
    },
    [
      data.drivers,
      dayStrings,
      suggestions,
      handleAcceptSuggestion,
      handleDismissSuggestion,
      deleteDriverUnavail,
      deleteVehicleUnavail,
      onOpenSlotClick,
      onLoadClick,
    ],
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[900px]">
        <CapacityStrip drivers={data.drivers} dayStrings={dayStrings} />
        <TimelineHeader dayStrings={dayStrings} />
        {data.drivers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No active drivers found. Add drivers in Fleet to start planning.
          </div>
        ) : useVirtual ? (
          <div ref={parentRef}>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderRow(virtualRow.index)}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div ref={parentRef}>{data.drivers.map((_, i) => renderRow(i))}</div>
        )}
      </div>
    </div>
  );
}
