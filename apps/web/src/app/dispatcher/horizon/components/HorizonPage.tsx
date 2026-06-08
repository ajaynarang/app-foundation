'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { GanttChartSquare, CalendarDays } from 'lucide-react';
import { PageHeader, FilterBar, ViewSwitcher } from '@/shared/components/page-chrome';
import { useHorizon } from '@/features/horizon/hooks/use-horizon';
import { useWeekNavigation } from '@/features/horizon/hooks/use-week-navigation';
import { useReassignLoad } from '@/features/horizon/hooks/use-reassign-load';
import type { HorizonView } from '@/features/horizon/types';
import { useLoadById } from '@/features/fleet/loads/hooks/use-loads';
import { LoadDetailPanel } from '@/features/fleet/loads/components/LoadDetailPanel';
import { Sheet, SheetContent } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { HorizonWeekNav } from './HorizonWeekNav';
import { SallyInsightBar } from './SallyInsightBar';
import { HorizonTimeline } from './timeline/HorizonTimeline';
import { HorizonWeek } from './week/HorizonWeek';
import { UnavailabilityDialog } from './UnavailabilityDialog';

export function HorizonPage() {
  return (
    <Suspense fallback={<HorizonSkeleton />}>
      <HorizonPageInner />
    </Suspense>
  );
}

function HorizonPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = (searchParams.get('view') as HorizonView) || 'timeline';
  const { weekOf, weekLabel, dayStrings, navigateWeek, isCurrentWeek } = useWeekNavigation();
  const { data, isLoading } = useHorizon(weekOf);
  const reassignLoad = useReassignLoad();

  // Load detail sheet
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const { data: selectedLoad } = useLoadById(selectedLoadId ?? '');
  const loadSizing = useSheetSizing('load');

  // Search
  const [search, setSearch] = useState('');
  const filteredData = useMemo(() => {
    if (!data || !search.trim()) return data;
    const term = search.toLowerCase();
    return {
      ...data,
      drivers: data.drivers.filter(
        (d) => d.name.toLowerCase().includes(term) || (d.vehicleNumber && d.vehicleNumber.toLowerCase().includes(term)),
      ),
    };
  }, [data, search]);

  // Unavailability popover state
  const [popoverState, setPopoverState] = useState<{
    open: boolean;
    driverId: number;
    vehicleId: number | null;
    dayStr: string;
    driverName: string;
  } | null>(null);

  // Keyboard shortcuts
  const setView = useCallback(
    (newView: HorizonView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', newView);
      router.push(`/dispatcher/horizon?${params.toString()}`);
    },
    [searchParams, router],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft':
          navigateWeek('prev');
          break;
        case 'ArrowRight':
          navigateWeek('next');
          break;
        case 't':
        case 'T':
          navigateWeek('today');
          break;
        case '1':
          setView('timeline');
          break;
        case '2':
          setView('week');
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateWeek, setView]);

  // Drag-and-drop handler
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !data) return;
      const loadId = active.data.current?.loadId as string | undefined;
      const targetDriverId = over.data.current?.driverId as number | undefined;
      if (!loadId || !targetDriverId) return;

      // Resolve string IDs needed by the assign endpoint
      const targetDriver = data.drivers.find((d) => d.driverId === targetDriverId);
      if (!targetDriver?.driverStringId || !targetDriver?.vehicleStringId) return;

      reassignLoad.mutate({
        loadId,
        driverId: targetDriver.driverStringId,
        vehicleId: targetDriver.vehicleStringId,
      });
    },
    [reassignLoad, data],
  );

  // Load click handler — open detail sheet
  const handleLoadClick = useCallback((loadId: string) => {
    setSelectedLoadId(loadId);
  }, []);

  // Open slot click handler
  const handleOpenSlotClick = useCallback(
    (driverId: number, dayStr: string) => {
      const driver = data?.drivers.find((d) => d.driverId === driverId);
      if (!driver) return;
      setPopoverState({
        open: true,
        driverId,
        vehicleId: driver.vehicleId,
        dayStr,
        driverName: driver.name,
      });
    },
    [data],
  );

  // Require 8px movement before drag starts — allows click-to-open
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  if (isLoading || !data) return <HorizonSkeleton />;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Zone 1 — Header */}
        <PageHeader title="Horizon" subtitle="The week ahead, load by load" hasTabs />

        {/* Zone 3 — Filter bar: search · week nav (date scope) · view switcher */}
        <FilterBar
          className="print:hidden"
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search drivers or vehicles..."
          searchClassName="w-full sm:w-72"
        >
          <HorizonWeekNav weekLabel={weekLabel} isCurrentWeek={isCurrentWeek} onNavigateWeek={navigateWeek} />
          <div className="sm:ml-auto">
            <ViewSwitcher
              value={view}
              onChange={setView}
              options={[
                { value: 'timeline', label: 'Timeline', icon: GanttChartSquare },
                { value: 'week', label: 'Week', icon: CalendarDays },
              ]}
            />
          </div>
        </FilterBar>

        <SallyInsightBar
          message={
            data.sallyInsight?.message ??
            `${data.stats.driversLoaded}/${data.stats.totalDrivers} drivers loaded · ${data.stats.openDriverDays} open driver-days this week`
          }
        />

        {view === 'timeline' ? (
          <HorizonTimeline
            data={filteredData!}
            dayStrings={dayStrings}
            onOpenSlotClick={handleOpenSlotClick}
            onLoadClick={handleLoadClick}
          />
        ) : (
          <HorizonWeek data={filteredData!} dayStrings={dayStrings} />
        )}

        {popoverState && (
          <UnavailabilityDialog
            driverId={popoverState.driverId}
            vehicleId={popoverState.vehicleId}
            initialDate={popoverState.dayStr}
            driverName={popoverState.driverName}
            open={popoverState.open}
            onOpenChange={(open) => {
              if (!open) setPopoverState(null);
            }}
          />
        )}

        {/* Load detail sheet — identical pattern to loads page */}
        <Sheet
          open={!!selectedLoadId}
          onOpenChange={(open) => {
            if (!open) setSelectedLoadId(null);
          }}
        >
          <SheetContent
            className="w-full p-0 flex flex-col"
            pinnable
            resizable
            defaultWidth={sizeModeToPixels(loadSizing.effectiveSize)}
          >
            {selectedLoad && (
              <LoadDetailPanel
                load={selectedLoad}
                readOnly
                onStatusChange={() => {}}
                onDuplicate={() => {}}
                onCopyTrackingLink={() => {}}
                headerExtra={loadSizing.showControls ? <SheetSizeControls entityType="load" allowFull /> : undefined}
              />
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DndContext>
  );
}

function HorizonSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
