'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, MapPin, Search } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Input } from '@sally/ui/components/ui/input';
import { cn } from '@sally/ui';
import { formatHOSHours } from '@/shared/lib/format-time';
import { AlertTriangle } from 'lucide-react';
import type { DriverRecommendation } from '../types';
import type { LoadStop, LoadLegListItem } from '@sally/shared-types';

// ---- Props ----

export interface RelayLegCardsProps {
  legs: LoadLegListItem[];
  stops: LoadStop[];
  drivers: DriverRecommendation[];
  selectedDrivers: Record<string, { driverId: string; vehicleId?: string }>;
  onDriverSelect: (legId: string, driverId: string, vehicleId?: string) => void;
  vehicles: Array<{ vehicleId: string; unitNumber: string; equipmentType?: string }>;
}

// ---- Helpers ----

function stopLabel(stop: LoadStop | undefined): string {
  if (!stop) return 'Unknown';
  if (stop.stopCity && stop.stopState) return `${stop.stopCity}, ${stop.stopState}`;
  if (stop.stopCity) return stop.stopCity;
  if (stop.stopName) return stop.stopName;
  return 'Stop';
}

function hosColor(hours: number): string {
  if (hours >= 4) return 'text-green-500';
  if (hours >= 2) return 'text-yellow-500';
  return 'text-red-500';
}

// ---- Driver picker popover ----

function DriverPicker({
  drivers,
  selectedDriverId,
  onSelect,
}: {
  drivers: DriverRecommendation[];
  selectedDriverId: string | null;
  onSelect: (driver: DriverRecommendation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return drivers;
    const q = search.toLowerCase();
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, search]);

  const selected = drivers.find((d) => d.driverId === selectedDriverId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'w-full justify-between h-9 text-sm',
            selected ? 'border-accent/40 bg-accent/5 dark:bg-accent/10' : 'border-border',
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[9px] font-semibold text-foreground">
                {selected.initials}
              </span>
              <span className="truncate">{selected.name}</span>
              <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
            </span>
          ) : (
            <span className="text-muted-foreground">Select driver...</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 ml-1 text-muted-foreground flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {drivers.length > 3 && (
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-sm"
            />
          </div>
        )}
        <div className="max-h-60 overflow-y-auto space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground px-2 py-3 text-center">No drivers found</p>
          )}
          {filtered.map((driver) => {
            const isSelected = driver.driverId === selectedDriverId;
            return (
              <Button
                key={driver.driverId}
                variant="ghost"
                size="sm"
                className={cn(
                  'w-full justify-start h-auto py-2 px-2 text-left',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  isSelected && 'bg-accent/5 dark:bg-accent/10',
                )}
                onClick={() => {
                  onSelect(driver);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <div className="flex items-center gap-2 w-full min-w-0">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[9px] font-semibold text-foreground">
                    {driver.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{driver.name}</span>
                      {driver.isBestMatch && (
                        <Badge className="text-[9px] px-1 py-0 h-3.5 bg-accent/15 text-accent border-accent/20 font-normal">
                          Best
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 text-2xs text-muted-foreground">
                      <span className={hosColor(driver.hos.driveHoursRemaining)}>
                        HOS {formatHOSHours(driver.hos.driveHoursRemaining)}
                      </span>
                      <span>
                        {driver.proximity.distanceMilesFromPickup.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}{' '}
                        mi
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />}
                </div>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---- Exchange point strip ----

function ExchangePointStrip({ stop }: { stop: LoadStop | undefined }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-yellow-500/40 bg-yellow-500/5 dark:bg-yellow-500/10 px-3 py-2">
      <MapPin className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
      <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
        Exchange Point: {stopLabel(stop)}
      </span>
    </div>
  );
}

// ---- Main component ----

export function RelayLegCards({ legs, stops, drivers, selectedDrivers, onDriverSelect, vehicles }: RelayLegCardsProps) {
  const stopsById = useMemo(() => {
    const map = new Map<number, LoadStop>();
    for (const stop of stops) {
      map.set(stop.id, stop);
    }
    return map;
  }, [stops]);

  // Find exchange stops between legs
  const exchangeStops = useMemo(() => {
    const result: Map<string, LoadStop | undefined> = new Map();
    for (let i = 0; i < legs.length - 1; i++) {
      const currentLeg = legs[i];
      // The destination of the current leg is the exchange point
      const exchangeStop = currentLeg.destStopId != null ? stopsById.get(currentLeg.destStopId) : undefined;
      result.set(currentLeg.legId, exchangeStop);
    }
    return result;
  }, [legs, stopsById]);

  const sortedLegs = useMemo(() => [...legs].sort((a, b) => a.sequence - b.sequence), [legs]);

  // Adjacent-driver duplicate detection (I2)
  const adjacentDuplicateLegIds = useMemo(() => {
    const duplicates = new Set<string>();
    for (let i = 0; i < sortedLegs.length - 1; i++) {
      const currentSel = selectedDrivers[sortedLegs[i].legId];
      const nextSel = selectedDrivers[sortedLegs[i + 1].legId];
      if (currentSel?.driverId && nextSel?.driverId && currentSel.driverId === nextSel.driverId) {
        duplicates.add(sortedLegs[i].legId);
        duplicates.add(sortedLegs[i + 1].legId);
      }
    }
    return duplicates;
  }, [sortedLegs, selectedDrivers]);

  return (
    <div className="space-y-2">
      <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Relay Legs</p>

      {sortedLegs.map((leg, index) => {
        const originStop = leg.originStopId != null ? stopsById.get(leg.originStopId) : undefined;
        const destStop = leg.destStopId != null ? stopsById.get(leg.destStopId) : undefined;
        const selection = selectedDrivers[leg.legId];
        const hasAdjacentDuplicate = adjacentDuplicateLegIds.has(leg.legId);
        const selectedDriver = selection ? drivers.find((d) => d.driverId === selection.driverId) : null;

        return (
          <div key={leg.legId}>
            {/* Leg card */}
            <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
              {/* Header: LEG N badge + route + miles */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-2xs px-1.5 py-0 h-4 font-semibold flex-shrink-0">
                    LEG {leg.sequence}
                  </Badge>
                  <span className="text-sm text-foreground truncate">
                    {stopLabel(originStop)} → {stopLabel(destStop)}
                  </span>
                </div>
                {leg.actualMiles != null && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    ~{leg.actualMiles.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi
                  </span>
                )}
              </div>

              {/* Driver select */}
              <div className="space-y-1">
                <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Driver</p>
                <DriverPicker
                  drivers={drivers}
                  selectedDriverId={selection?.driverId ?? null}
                  onSelect={(driver) => {
                    onDriverSelect(leg.legId, driver.driverId, driver.vehicle?.vehicleId);
                  }}
                />
                {/* Selected driver HOS summary */}
                {selectedDriver && (
                  <div className="flex gap-2 text-2xs text-muted-foreground px-1">
                    <span className={hosColor(selectedDriver.hos.driveHoursRemaining)}>
                      HOS {formatHOSHours(selectedDriver.hos.driveHoursRemaining)}
                    </span>
                    <span>
                      {selectedDriver.proximity.distanceMilesFromPickup.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}{' '}
                      mi from pickup
                    </span>
                  </div>
                )}
                {/* Adjacent duplicate driver warning */}
                {hasAdjacentDuplicate && (
                  <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 dark:bg-red-500/15 border border-red-500/20 px-2 py-1">
                    <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                    <span className="text-2xs text-red-600 dark:text-red-400 font-medium">
                      Same driver on consecutive legs
                    </span>
                  </div>
                )}
              </div>

              {/* Vehicle select */}
              <div className="space-y-1">
                <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Vehicle</p>
                <Select
                  value={selection?.vehicleId ?? ''}
                  onValueChange={(vehicleId) => {
                    if (selection) {
                      onDriverSelect(leg.legId, selection.driverId, vehicleId);
                    }
                  }}
                  disabled={!selection}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a vehicle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No vehicles available
                      </SelectItem>
                    ) : (
                      vehicles.map((v) => (
                        <SelectItem key={v.vehicleId} value={v.vehicleId}>
                          <span className="font-medium">#{v.unitNumber}</span>
                          {v.equipmentType && (
                            <span className="ml-1.5 text-muted-foreground text-xs">{v.equipmentType}</span>
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Exchange point strip between legs */}
            {index < sortedLegs.length - 1 && (
              <div className="my-2">
                <ExchangePointStrip stop={exchangeStops.get(leg.legId)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
