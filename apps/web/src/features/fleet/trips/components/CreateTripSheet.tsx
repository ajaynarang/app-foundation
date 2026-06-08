'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatLoadLabel } from '@sally/shared-types';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Switch } from '@sally/ui/components/ui/switch';
import { Label } from '@sally/ui/components/ui/label';
import { Badge } from '@sally/ui/components/ui/badge';
import { X, Truck } from 'lucide-react';
import { useCreateTrip } from '../hooks/use-trip-actions';
import type { LoadListItem } from '@/features/fleet/loads/types';

interface CreateTripSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLoads: LoadListItem[];
  onSuccess?: () => void;
}

export function CreateTripSheet({ open, onOpenChange, selectedLoads, onSuccess }: CreateTripSheetProps) {
  const [orderedLoads, setOrderedLoads] = useState<LoadListItem[]>([]);
  const [generateRoute, setGenerateRoute] = useState(false);
  const createTrip = useCreateTrip();

  // Sync selected loads when sheet opens
  useEffect(() => {
    if (open && selectedLoads.length > 0) {
      const sorted = [...selectedLoads].sort((a, b) => {
        const aDate = a.pickupDate || '';
        const bDate = b.pickupDate || '';
        return aDate.localeCompare(bDate);
      });
      setOrderedLoads(sorted);
    }
  }, [open, selectedLoads]);

  const totalRevenue = useMemo(() => orderedLoads.reduce((sum, l) => sum + (l.rateCents ?? 0), 0), [orderedLoads]);

  const handleRemove = (loadId: string) => {
    setOrderedLoads((prev) => prev.filter((l) => l.loadNumber !== loadId));
  };

  const handleSubmit = async () => {
    await createTrip.mutateAsync({
      loadIds: orderedLoads.map((l) => l.loadNumber),
      generateRoute: generateRoute || undefined,
    });
    onOpenChange(false);
    onSuccess?.();
  };

  const canSubmit = orderedLoads.length >= 2;

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Create Trip"
      description={`Group ${orderedLoads.length} loads into a single trip`}
      mode="edit"
      onSubmit={handleSubmit}
      submitLabel="Create Trip"
      isSubmitting={createTrip.isPending}
      submitDisabled={!canSubmit}
      entityType="trip"
    >
      <div className="space-y-4 p-4">
        {/* Load list */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">
            Loads ({orderedLoads.length}) — Ordered by pickup date
          </Label>
          <div className="space-y-2">
            {orderedLoads.map((load, idx) => (
              <div
                key={load.loadNumber}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-medium text-foreground">
                      #{idx + 1} · {formatLoadLabel(load.loadNumber, load.referenceNumber)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {load.status}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {load.customerName} · {load.originCity}, {load.originState} → {load.destinationCity},{' '}
                    {load.destinationState}
                  </p>
                </div>
                <span className="text-xs text-foreground font-medium shrink-0">
                  ${((load.rateCents ?? 0) / 100).toLocaleString()}
                </span>
                {orderedLoads.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => handleRemove(load.loadNumber)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-lg border border-border bg-muted/30 dark:bg-gray-900/30 p-3 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Revenue</span>
            <span className="font-medium text-foreground">${(totalRevenue / 100).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Load Count</span>
            <span className="font-medium text-foreground">{orderedLoads.length}</span>
          </div>
        </div>

        {/* Options */}
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="text-xs">Generate Route Plan</Label>
              <p className="text-[10px] text-muted-foreground">Auto-plan optimized route after creation</p>
            </div>
          </div>
          <Switch checked={generateRoute} onCheckedChange={setGenerateRoute} />
        </div>

        {!canSubmit && orderedLoads.length > 0 && (
          <p className="text-xs text-destructive">A trip requires at least 2 loads.</p>
        )}
      </div>
    </FormSheet>
  );
}
