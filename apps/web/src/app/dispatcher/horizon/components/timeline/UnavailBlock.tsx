import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Ban, Wrench, X } from 'lucide-react';
import type { HorizonUnavailBlock } from '@/features/horizon/types';

interface UnavailBlockProps {
  unavail: HorizonUnavailBlock;
  variant: 'driver' | 'vehicle';
  vehicleNumber?: string | null;
  span?: number;
  onDelete?: (id: number) => void;
}

const TYPE_LABELS: Record<string, string> = {
  PTO: 'PTO',
  APPOINTMENT: 'Appt',
  HOME_TIME: 'Home',
  TRAINING: 'Training',
  OTHER: 'Unavail',
  MAINTENANCE: 'Maintenance',
  INSPECTION: 'Inspection',
  REPAIR: 'Repair',
  OUT_OF_SERVICE: 'OOS',
};

export function UnavailBlock({ unavail, variant, vehicleNumber, span = 1, onDelete }: UnavailBlockProps) {
  const isVehicle = variant === 'vehicle';
  const Icon = isVehicle ? Wrench : Ban;

  return (
    <div
      className={cn(
        'group relative rounded-md border px-2 py-1 text-xs',
        isVehicle
          ? 'border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
          : 'border-red-500/30 bg-red-500/5 dark:bg-red-500/10 text-red-700 dark:text-red-400',
      )}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate font-medium">
          {isVehicle && vehicleNumber ? `${vehicleNumber} ` : ''}
          {TYPE_LABELS[unavail.type] ?? unavail.type}
        </span>
      </div>
      {unavail.note && <div className="truncate text-2xs opacity-70">{unavail.note}</div>}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(unavail.id)}
          className="absolute -right-1 -top-1 hidden h-4 w-4 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground group-hover:flex"
          aria-label="Remove unavailability"
        >
          <X className="h-2.5 w-2.5" />
        </Button>
      )}
    </div>
  );
}
