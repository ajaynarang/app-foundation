'use client';

import { useDraggable } from '@dnd-kit/core';
import { cn } from '@sally/ui';
import { formatLoadLabel } from '@sally/shared-types';
import type { HorizonLoadBlock } from '@/features/horizon/types';

interface LoadBlockProps {
  load: HorizonLoadBlock;
  onClick?: (loadId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  ASSIGNED: 'Assigned',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'border-border bg-muted/30 dark:bg-muted/10 text-foreground',
  ASSIGNED: 'border-border bg-muted/50 dark:bg-muted/20 text-foreground',
  IN_TRANSIT: 'border-foreground/20 bg-foreground/5 dark:bg-foreground/10 text-foreground font-medium',
  DELIVERED: 'border-border bg-muted/30 text-muted-foreground opacity-50',
};

export function LoadBlock({ load, onClick }: LoadBlockProps) {
  const isDraggable = load.status === 'PENDING' || load.status === 'ASSIGNED';

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `load-${load.loadNumber}`,
    data: { loadId: load.loadNumber, type: 'load' },
    disabled: !isDraggable,
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 50,
      }
    : undefined;

  const handleClick = () => {
    if (isDragging) return;
    onClick?.(load.loadNumber);
  };

  return (
    <div
      ref={setNodeRef}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
      onClick={!isDraggable ? handleClick : undefined}
      onPointerUp={isDraggable ? handleClick : undefined}
      className={cn(
        'rounded-md border px-2 py-0.5 text-xs transition-shadow leading-tight',
        STATUS_STYLES[load.status] ?? STATUS_STYLES.PENDING,
        isDraggable && 'cursor-grab hover:shadow-md',
        !isDraggable && onClick && 'cursor-pointer hover:bg-muted/40 dark:hover:bg-muted/15',
        isDragging && 'opacity-50 shadow-lg',
      )}
      style={style}
    >
      <div className="flex items-center gap-1 truncate">
        <span className="font-medium">{formatLoadLabel(load.loadNumber, load.referenceNumber)}</span>
        <span className="shrink-0 rounded px-1 py-px text-[9px] uppercase tracking-wide bg-foreground/10 text-muted-foreground">
          {STATUS_LABELS[load.status] ?? load.status}
        </span>
      </div>
      <div className="truncate text-2xs text-muted-foreground">{load.route}</div>
      {load.customerName && <div className="truncate text-2xs text-muted-foreground">{load.customerName}</div>}
    </div>
  );
}
