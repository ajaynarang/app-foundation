'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@sally/ui';
import type { DragTransition } from '../hooks/use-load-drag-drop';

type KanbanDropZoneProps = {
  id: string;
  transition: DragTransition | null;
  isActive: boolean;
  children: React.ReactNode;
  /** For relay loads: show which leg is advancing */
  relayLegSequence?: number | null;
};

export function KanbanDropZone({ id, transition, isActive, children, relayLegSequence }: KanbanDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const showHighlight = isActive && transition;
  const colorClasses = transition
    ? {
        forward: {
          border: 'border-green-500 dark:border-green-400',
          bg: 'bg-green-500/5 dark:bg-green-400/5',
          text: 'text-green-600 dark:text-green-400',
          glow: 'shadow-[0_0_20px_rgba(34,197,94,0.1)]',
        },
        backward: {
          border: 'border-amber-500 dark:border-amber-400',
          bg: 'bg-amber-500/5 dark:bg-amber-400/5',
          text: 'text-amber-600 dark:text-amber-400',
          glow: 'shadow-[0_0_20px_rgba(245,158,11,0.1)]',
        },
        terminal: {
          border: 'border-blue-500 dark:border-blue-400',
          bg: 'bg-blue-500/5 dark:bg-blue-400/5',
          text: 'text-blue-600 dark:text-blue-400',
          glow: 'shadow-[0_0_20px_rgba(59,130,246,0.1)]',
        },
      }[transition.direction]
    : null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex flex-col rounded-lg min-h-[200px] transition-all duration-200',
        showHighlight && colorClasses
          ? cn('border-2', colorClasses.border, colorClasses.bg, isOver && colorClasses.glow)
          : 'bg-muted/30 dark:bg-muted/10',
        isActive && !showHighlight && 'opacity-50',
      )}
    >
      {children}
      {showHighlight && isOver && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-lg pointer-events-none z-10',
            colorClasses?.bg,
          )}
        >
          <div
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-3 rounded-md border-2 border-dashed',
              colorClasses?.border,
            )}
          >
            <span className={cn('text-sm font-medium', colorClasses?.text)}>
              {relayLegSequence
                ? transition.label.replace('Drop to ', `Drop to mark Leg ${relayLegSequence} `)
                : transition.label}
            </span>
            {relayLegSequence && (
              <span className={cn('text-xs opacity-70', colorClasses?.text)}>Relay Leg {relayLegSequence}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
