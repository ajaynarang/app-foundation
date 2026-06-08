'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@sally/ui';
import { Check } from 'lucide-react';

type DeliveredDropStripProps = {
  visible: boolean;
  /** For relay loads: the leg sequence being delivered */
  relayLegSequence?: number | null;
  /** Whether this is a mid-relay leg (not the final one) */
  isRelayMidLeg?: boolean;
};

export function DeliveredDropStrip({ visible, relayLegSequence, isRelayMidLeg }: DeliveredDropStripProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'delivered', disabled: !visible });

  if (!visible) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'fixed right-0 top-0 bottom-0 w-16 z-40 flex flex-col items-center justify-center',
        'transition-all duration-200',
        'border-l-2 border-blue-500 dark:border-blue-400',
        'bg-blue-500/5 dark:bg-blue-400/5',
        isOver && 'bg-blue-500/10 dark:bg-blue-400/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]',
      )}
    >
      <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400">
        <Check className="h-5 w-5" />
        <span className="text-2xs font-semibold leading-tight text-center">
          {isRelayMidLeg && relayLegSequence ? (
            <>
              {`Mark Leg ${relayLegSequence}`}
              <br />
              Delivered
            </>
          ) : (
            <>
              Mark
              <br />
              Delivered
            </>
          )}
        </span>
        {isRelayMidLeg && <span className="text-[9px] opacity-70 text-center leading-tight">at exchange</span>}
      </div>
    </div>
  );
}
