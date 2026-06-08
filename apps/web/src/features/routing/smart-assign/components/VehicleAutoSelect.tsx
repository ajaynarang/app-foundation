'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useDriverRecommendations } from '@/features/routing/smart-assign';
import { useVehicles } from '@/features/fleet/vehicles';

interface Props {
  loadId: string;
  selectedDriverId: string | null;
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
  loadEquipmentType: string;
}

export function VehicleAutoSelect({
  loadId,
  selectedDriverId,
  selectedVehicleId,
  onSelectVehicle,
  loadEquipmentType,
}: Props) {
  const { data: recommendationsData, isLoading: isLoadingRec } = useDriverRecommendations(loadId);
  const { data: vehicles, isLoading: isLoadingVehicles } = useVehicles();

  // Find the selected driver's recommendation to get their assigned vehicle
  const selectedRec = recommendationsData?.recommendations.find(
    (r: { driverId: string }) => r.driverId === selectedDriverId,
  );
  const assignedVehicle = selectedRec?.vehicle ?? null;

  // Auto-pair assigned vehicle when driver changes (pre-select in dropdown)
  useEffect(() => {
    if (!selectedDriverId) return;
    if (assignedVehicle && !selectedVehicleId) {
      onSelectVehicle(assignedVehicle.vehicleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriverId, assignedVehicle?.vehicleId]);

  if (!selectedDriverId) return null;

  if (isLoadingRec || isLoadingVehicles) {
    return <Skeleton className="h-10 w-full rounded-md" />;
  }

  const driverName = selectedRec?.name ?? 'this driver';
  const availableVehicles = vehicles?.filter((v) => v.lifecycleStatus === 'ACTIVE') ?? [];

  return (
    <div className="space-y-2">
      <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Vehicle</p>

      {/* No vehicle warning */}
      {!assignedVehicle && !selectedVehicleId && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>No vehicle assigned to {driverName} — select one below</span>
        </div>
      )}

      {/* Always show dropdown — pre-selected with auto-paired vehicle */}
      <Select value={selectedVehicleId ?? ''} onValueChange={onSelectVehicle}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Select a vehicle…" />
        </SelectTrigger>
        <SelectContent>
          {availableVehicles.length === 0 ? (
            <SelectItem value="__none" disabled>
              No vehicles available
            </SelectItem>
          ) : (
            availableVehicles.map((v) => (
              <SelectItem key={v.vehicleId} value={v.vehicleId}>
                <span className="font-medium">#{v.unitNumber}</span>
                <span className="ml-1.5 text-muted-foreground text-xs">
                  {v.equipmentType}
                  {v.equipmentType !== loadEquipmentType && (
                    <span className="text-yellow-500 ml-1">⚠ type mismatch</span>
                  )}
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
