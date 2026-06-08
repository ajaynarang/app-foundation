'use client';

import { useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useTrailers } from '@/features/fleet/trailers/hooks/use-trailers';
import { useVehicles } from '@/features/fleet/vehicles';

interface Props {
  selectedVehicleId: string | null;
  selectedTrailerId: string | null;
  onSelectTrailer: (trailerId: string | null) => void;
  loadEquipmentType: string;
  /** When true (POWER_ONLY), hide the trailer selector entirely */
  hidden?: boolean;
}

export function TrailerAutoSelect({
  selectedVehicleId,
  selectedTrailerId,
  onSelectTrailer,
  loadEquipmentType,
  hidden,
}: Props) {
  const { data: trailers, isLoading: isLoadingTrailers } = useTrailers();
  const { data: vehicles } = useVehicles();

  // Find the selected vehicle to get its currentTrailer
  const selectedVehicle = useMemo(
    () => vehicles?.find((v) => v.vehicleId === selectedVehicleId),
    [vehicles, selectedVehicleId],
  );
  const currentTrailer = selectedVehicle?.currentTrailer ?? null;

  // Auto-fill trailer from vehicle's currentTrailer when vehicle changes
  useEffect(() => {
    if (!selectedVehicleId) return;
    if (currentTrailer && !selectedTrailerId) {
      onSelectTrailer(currentTrailer.trailerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleId, currentTrailer?.trailerId]);

  // Track whether the trailer was auto-selected
  const isAutoFilled = currentTrailer?.trailerId === selectedTrailerId && !!selectedTrailerId;

  // Sort: matching equipment type first, then mismatches (must be before early returns)
  const sortedTrailers = useMemo(() => {
    const active = trailers?.filter((t) => t.lifecycleStatus === 'ACTIVE') ?? [];
    return [...active].sort((a, b) => {
      const aMatch = a.equipmentType === loadEquipmentType ? 0 : 1;
      const bMatch = b.equipmentType === loadEquipmentType ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [trailers, loadEquipmentType]);

  if (hidden || !selectedVehicleId) return null;

  if (isLoadingTrailers) {
    return <Skeleton className="h-10 w-full rounded-md" />;
  }

  return (
    <div className="space-y-2">
      <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">
        Trailer
        {isAutoFilled && (
          <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">(auto-filled)</span>
        )}
      </p>

      <Select value={selectedTrailerId ?? ''} onValueChange={(val) => onSelectTrailer(val || null)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Select a trailer..." />
        </SelectTrigger>
        <SelectContent>
          {sortedTrailers.length === 0 ? (
            <SelectItem value="__none" disabled>
              No trailers available
            </SelectItem>
          ) : (
            sortedTrailers.map((t) => {
              const isMismatch = loadEquipmentType && t.equipmentType !== loadEquipmentType;
              return (
                <SelectItem key={t.trailerId} value={t.trailerId}>
                  <span className="font-medium">#{t.unitNumber}</span>
                  <span className="ml-1.5 text-muted-foreground text-xs">
                    {t.equipmentType?.replace(/_/g, ' ')}
                    {t.lengthFeet ? ` ${t.lengthFeet}ft` : ''}
                    {isMismatch && <span className="text-yellow-500 ml-1">(mismatch)</span>}
                  </span>
                </SelectItem>
              );
            })
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
