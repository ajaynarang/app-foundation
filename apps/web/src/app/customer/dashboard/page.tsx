'use client';

import { useState, useMemo } from 'react';
import { formatLoadLabel } from '@sally/shared-types';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Package, ArrowRight, Calendar } from 'lucide-react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useCustomerLoads } from '@/features/customer/hooks';
import type { CustomerLoad } from '@/features/customer/types';
import { STATUS_CONFIG } from '@/features/customer/constants';
import { LoadDetailSheet } from '@/features/customer/components/load-detail-sheet';

export default function CustomerDashboard() {
  const { data: loads = [], isLoading } = useCustomerLoads();
  const [selectedLoad, setSelectedLoad] = useState<CustomerLoad | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeLoads = useMemo(() => loads.filter((l) => !['DELIVERED', 'CANCELLED'].includes(l.status)), [loads]);
  const historicalLoads = useMemo(() => loads.filter((l) => l.status === 'DELIVERED'), [loads]);

  // Keep sheet data live from query cache
  const liveSelectedLoad = useMemo(() => {
    if (!selectedLoad || !loads.length) return selectedLoad;
    return loads.find((l) => l.loadId === selectedLoad.loadNumber) ?? selectedLoad;
  }, [selectedLoad, loads]);

  const handleLoadClick = (load: CustomerLoad) => {
    setSelectedLoad(load);
    setSheetOpen(true);
  };

  return (
    <>
      <div className="space-y-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground">My Shipments</h1>

        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active{!isLoading && ` (${activeLoads.length})`}</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3 mt-4">
            {isLoading ? (
              <LoadListSkeleton />
            ) : activeLoads.length === 0 ? (
              <EmptyState message="No active shipments" />
            ) : (
              activeLoads.map((load) => (
                <CustomerLoadCard key={load.loadNumber} load={load} onClick={() => handleLoadClick(load)} />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3 mt-4">
            {isLoading ? (
              <LoadListSkeleton />
            ) : historicalLoads.length === 0 ? (
              <EmptyState message="No completed shipments yet" />
            ) : (
              historicalLoads.map((load) => (
                <CustomerLoadCard key={load.loadNumber} load={load} onClick={() => handleLoadClick(load)} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <LoadDetailSheet open={sheetOpen} onOpenChange={setSheetOpen} load={liveSelectedLoad} />
    </>
  );
}

function CustomerLoadCard({ load, onClick }: { load: CustomerLoad; onClick: () => void }) {
  const { formatCalendarDate } = useFormatters();
  const config = STATUS_CONFIG[load.status] || { label: load.status, variant: 'muted' as const };

  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      tabIndex={0}
      role="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-foreground">
                {formatLoadLabel(load.loadNumber, load.referenceNumber)}
              </p>
              <Badge variant={config.variant} className="text-2xs">
                {config.label}
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="truncate">
                {load.originCity}, {load.originState}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {load.destinationCity}, {load.destinationState}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            {load.estimatedDelivery && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{formatCalendarDate(load.estimatedDelivery, DISPLAY_FORMATS.FRIENDLY)}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Package className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
