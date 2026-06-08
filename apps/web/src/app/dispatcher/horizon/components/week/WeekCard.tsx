import { cn } from '@sally/ui';
import { formatLoadLabel } from '@sally/shared-types';
import { Truck, Ban, Wrench } from 'lucide-react';
import type { HorizonDriverRow, HorizonDayData } from '@/features/horizon/types';

interface WeekCardProps {
  driver: HorizonDriverRow;
  dayData: HorizonDayData;
}

export function WeekCard({ driver, dayData }: WeekCardProps) {
  const hasLoad = dayData.loads.length > 0;
  const isDriverUnavail = !!dayData.driverUnavailability;
  const isVehicleUnavail = !!dayData.vehicleUnavailability;

  if (!hasLoad && !isDriverUnavail && !isVehicleUnavail) return null;

  return (
    <div
      className={cn(
        'rounded-lg border px-2 py-1.5 text-xs',
        hasLoad && 'border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10',
        isDriverUnavail && !hasLoad && 'border-red-500/30 bg-red-500/5 dark:bg-red-500/10',
        isVehicleUnavail &&
          !hasLoad &&
          !isDriverUnavail &&
          'border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-500/10',
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
          {driver.initials}
        </div>
        <span className="truncate font-medium text-foreground">{driver.name}</span>
      </div>

      {hasLoad &&
        dayData.loads.map((load) => (
          <div key={load.loadNumber} className="mt-1 truncate text-2xs text-muted-foreground">
            {formatLoadLabel(load.loadNumber, load.referenceNumber)} · {load.route}
          </div>
        ))}

      {isDriverUnavail && (
        <div className="mt-1 flex items-center gap-1 text-2xs text-red-600 dark:text-red-400">
          <Ban className="h-3 w-3" />
          {dayData.driverUnavailability!.type}
        </div>
      )}

      {isVehicleUnavail && (
        <div className="mt-1 flex items-center gap-1 text-2xs text-yellow-600 dark:text-yellow-400">
          <Wrench className="h-3 w-3" />
          <Truck className="h-3 w-3" />
          {dayData.vehicleUnavailability!.type}
        </div>
      )}
    </div>
  );
}
