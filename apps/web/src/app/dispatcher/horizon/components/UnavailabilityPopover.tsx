'use client';

import { useState, useCallback } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import {
  useCreateDriverUnavailability,
  useCreateVehicleUnavailability,
} from '@/features/horizon/hooks/use-horizon-mutations';
import type { CreateDriverUnavailabilityInput, CreateVehicleUnavailabilityInput } from '@/features/horizon/types';

interface UnavailabilityPopoverProps {
  driverId: number;
  vehicleId: number | null;
  initialDate: string;
  driverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const DRIVER_TYPES = ['PTO', 'APPOINTMENT', 'HOME_TIME', 'TRAINING', 'OTHER'] as const;
const VEHICLE_TYPES = ['MAINTENANCE', 'INSPECTION', 'REPAIR', 'OUT_OF_SERVICE', 'OTHER'] as const;

const TYPE_LABELS: Record<string, string> = {
  PTO: 'PTO',
  APPOINTMENT: 'Appt',
  HOME_TIME: 'Home',
  TRAINING: 'Training',
  OTHER: 'Other',
  MAINTENANCE: 'Maint.',
  INSPECTION: 'Inspect.',
  REPAIR: 'Repair',
  OUT_OF_SERVICE: 'OOS',
};

export function UnavailabilityPopover({
  driverId,
  vehicleId,
  initialDate,
  driverName,
  open,
  onOpenChange,
  children,
}: UnavailabilityPopoverProps) {
  const [tab, setTab] = useState<'driver' | 'vehicle'>('driver');
  const [driverType, setDriverType] = useState<CreateDriverUnavailabilityInput['type']>('PTO');
  const [vehicleType, setVehicleType] = useState<CreateVehicleUnavailabilityInput['type']>('MAINTENANCE');
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [note, setNote] = useState('');

  const createDriverUnavail = useCreateDriverUnavailability();
  const createVehicleUnavail = useCreateVehicleUnavailability();

  const handleSave = useCallback(() => {
    if (tab === 'driver') {
      createDriverUnavail.mutate(
        { driverId, type: driverType, startDate, endDate, note: note || undefined },
        { onSuccess: () => onOpenChange(false) },
      );
    } else if (vehicleId) {
      createVehicleUnavail.mutate(
        { vehicleId, type: vehicleType, startDate, endDate, note: note || undefined },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }, [
    tab,
    driverId,
    vehicleId,
    driverType,
    vehicleType,
    startDate,
    endDate,
    note,
    createDriverUnavail,
    createVehicleUnavail,
    onOpenChange,
  ]);

  const isPending = createDriverUnavail.isPending || createVehicleUnavail.isPending;
  const types = tab === 'driver' ? DRIVER_TYPES : VEHICLE_TYPES;
  const selectedType = tab === 'driver' ? driverType : vehicleType;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">{driverName}</div>

          {vehicleId && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'driver' | 'vehicle')}>
              <TabsList className="h-7 w-full">
                <TabsTrigger value="driver" className="flex-1 text-xs">
                  Driver
                </TabsTrigger>
                <TabsTrigger value="vehicle" className="flex-1 text-xs">
                  Vehicle
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="flex flex-wrap gap-1">
            {types.map((t) => (
              <Button
                key={t}
                variant={selectedType === t ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-2xs"
                onClick={() =>
                  tab === 'driver'
                    ? setDriverType(t as CreateDriverUnavailabilityInput['type'])
                    : setVehicleType(t as CreateVehicleUnavailabilityInput['type'])
                }
              >
                {TYPE_LABELS[t]}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-2xs">Start</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-2xs">End</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-7 text-xs" />
            </div>
          </div>

          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-7 text-xs"
          />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" loading={isPending} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
