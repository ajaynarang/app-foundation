'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/shared/lib/utils';

import { TRUST_LEVEL_LABELS } from '../../constants';
import type { TrustLevel } from '../../types';

const STOPS: TrustLevel[] = ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'];

interface TrustLevelSliderProps {
  value: TrustLevel;
  onChange: (next: TrustLevel) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * 3-stop trust level slider (Supervised → Assisted → Autonomous).
 * Solid primary range up to the active stop, grabbable thumb, and a
 * 3-column tick-label grid directly under the stops. Arrow keys work via
 * Radix.
 */
export function TrustLevelSlider({ value, onChange, disabled, id }: TrustLevelSliderProps) {
  const index = Math.max(0, STOPS.indexOf(value));

  return (
    <div className={cn('space-y-3', disabled && 'opacity-60')}>
      <SliderPrimitive.Root
        id={id}
        aria-label="Trust level"
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={0}
        max={2}
        step={1}
        value={[index]}
        disabled={disabled}
        onValueChange={(vals) => {
          const next = STOPS[vals[0]];
          if (next && next !== value) onChange(next);
        }}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>

        {/* Tick markers sit behind the thumb; filled when past them. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-0">
          {STOPS.map((stop, i) => (
            <span
              key={stop}
              className={cn(
                'h-3 w-3 shrink-0 rounded-full border-2',
                i <= index ? 'border-primary bg-primary' : 'border-border bg-background',
              )}
              aria-hidden
            />
          ))}
        </div>

        <SliderPrimitive.Thumb
          className={cn(
            'block h-5 w-5 rounded-full border-2 border-background bg-primary shadow-md',
            'ring-offset-background transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:pointer-events-none',
          )}
        />
      </SliderPrimitive.Root>

      <div className="grid grid-cols-3 gap-2 text-center">
        {STOPS.map((stop) => (
          <span
            key={stop}
            className={cn('text-xs', stop === value ? 'font-semibold text-foreground' : 'text-muted-foreground')}
          >
            {TRUST_LEVEL_LABELS[stop].label}
          </span>
        ))}
      </div>
    </div>
  );
}
