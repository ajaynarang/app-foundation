'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@sally/ui';
import { Plus } from 'lucide-react';

interface OpenSlotProps {
  driverId: number;
  dayStr: string;
  onClick?: () => void;
}

export function OpenSlot({ driverId, dayStr, onClick }: OpenSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${driverId}-${dayStr}`,
    data: { driverId, dayStr, type: 'slot' },
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'group flex min-h-[40px] items-center justify-center rounded-md border border-dashed border-transparent transition-colors',
        isOver && 'border-primary/50 bg-primary/5 dark:bg-primary/10',
        !isOver && 'hover:border-border hover:bg-muted/30 dark:hover:bg-muted/10',
        onClick && 'cursor-pointer',
      )}
    >
      <span className="hidden items-center gap-1 text-2xs text-muted-foreground group-hover:flex">
        <Plus className="h-3 w-3" />
        Mark unavailable
      </span>
    </div>
  );
}
