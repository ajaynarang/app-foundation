'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { format, startOfDay, differenceInCalendarDays } from 'date-fns';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Calendar } from '@sally/ui/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@sally/ui/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import {
  useCreateDriverUnavailability,
  useCreateVehicleUnavailability,
} from '@/features/horizon/hooks/use-horizon-mutations';
import type { CreateDriverUnavailabilityInput, CreateVehicleUnavailabilityInput } from '@/features/horizon/types';

interface UnavailabilityDialogProps {
  driverId: number;
  vehicleId: number | null;
  initialDate: string;
  driverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DRIVER_TYPES = ['PTO', 'APPOINTMENT', 'HOME_TIME', 'TRAINING', 'OTHER'] as const;
const VEHICLE_TYPES = ['MAINTENANCE', 'INSPECTION', 'REPAIR', 'OUT_OF_SERVICE', 'OTHER'] as const;

const TYPE_LABELS: Record<string, string> = {
  PTO: 'PTO',
  APPOINTMENT: 'Appointment',
  HOME_TIME: 'Home Time',
  TRAINING: 'Training',
  OTHER: 'Other',
  MAINTENANCE: 'Maintenance',
  INSPECTION: 'Inspection',
  REPAIR: 'Repair',
  OUT_OF_SERVICE: 'Out of Service',
};

export function UnavailabilityDialog({
  driverId,
  vehicleId,
  initialDate,
  driverName,
  open,
  onOpenChange,
}: UnavailabilityDialogProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const initialDateObj = useMemo(() => {
    const [y, m, d] = initialDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [initialDate]);

  const [tab, setTab] = useState<'driver' | 'vehicle'>('driver');
  const [driverType, setDriverType] = useState<CreateDriverUnavailabilityInput['type']>('PTO');
  const [vehicleType, setVehicleType] = useState<CreateVehicleUnavailabilityInput['type']>('MAINTENANCE');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: initialDateObj,
    to: initialDateObj,
  });
  const [note, setNote] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDateRange({ from: initialDateObj, to: initialDateObj });
      setNote('');
      setTab('driver');
      setDriverType('PTO');
      setVehicleType('MAINTENANCE');
    }
  }, [open, initialDateObj]);

  const createDriverUnavail = useCreateDriverUnavailability();
  const createVehicleUnavail = useCreateVehicleUnavailability();

  const canSave = dateRange?.from && dateRange?.to;

  const handleSave = useCallback(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    const startDate = format(dateRange.from, 'yyyy-MM-dd');
    const endDate = format(dateRange.to, 'yyyy-MM-dd');

    if (tab === 'driver') {
      createDriverUnavail.mutate(
        {
          driverId,
          type: driverType,
          startDate,
          endDate,
          note: note || undefined,
        },
        { onSuccess: () => onOpenChange(false) },
      );
    } else if (vehicleId) {
      createVehicleUnavail.mutate(
        {
          vehicleId,
          type: vehicleType,
          startDate,
          endDate,
          note: note || undefined,
        },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }, [
    tab,
    driverId,
    vehicleId,
    driverType,
    vehicleType,
    dateRange,
    note,
    createDriverUnavail,
    createVehicleUnavail,
    onOpenChange,
  ]);

  const isPending = createDriverUnavail.isPending || createVehicleUnavail.isPending;
  const types = tab === 'driver' ? DRIVER_TYPES : VEHICLE_TYPES;
  const selectedType = tab === 'driver' ? driverType : vehicleType;

  const rangeLabel = useMemo(() => {
    if (!dateRange?.from) return 'Select dates';
    const from = dateRange.from;
    const to = dateRange.to ?? from;
    const days = differenceInCalendarDays(to, from) + 1;
    const dayLabel = days === 1 ? '1 day' : `${days} days`;
    if (from.getTime() === to.getTime()) {
      return `${format(from, 'MMM d, yyyy')} (${dayLabel})`;
    }
    return `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')} (${dayLabel})`;
  }, [dateRange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {tab === 'driver' ? 'Schedule Time Off' : 'Schedule Downtime'} — {driverName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {vehicleId && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'driver' | 'vehicle')}>
              <TabsList className="w-full">
                <TabsTrigger value="driver" className="flex-1">
                  Driver
                </TabsTrigger>
                <TabsTrigger value="vehicle" className="flex-1">
                  Vehicle
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {types.map((t) => (
                <Button
                  key={t}
                  variant={selectedType === t ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
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
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Date Range</Label>
            <Button
              variant="outline"
              className="mt-1 w-full justify-start text-left text-sm font-medium"
              onClick={() => setCalendarOpen((v) => !v)}
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              {rangeLabel}
            </Button>
            {calendarOpen && (
              <div className="mt-2 flex justify-center">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    // Auto-collapse after selecting end date
                    if (range?.from && range?.to) {
                      setCalendarOpen(false);
                    }
                  }}
                  disabled={{ before: today }}
                  defaultMonth={initialDateObj}
                  numberOfMonths={1}
                />
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Input
              placeholder="e.g., Family vacation"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={isPending} onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
