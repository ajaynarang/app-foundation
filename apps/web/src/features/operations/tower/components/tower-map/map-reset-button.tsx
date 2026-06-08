'use client';

import { LocateFixed } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';

interface MapResetButtonProps {
  /** Re-frame the viewport to the whole fleet. */
  onReset: () => void;
}

/**
 * Reset-to-fleet viewport control for the Tower map.
 *
 * Mounted only by `TowerMap` once the dispatcher has manually moved the map
 * away from the auto-fit fleet framing — so it costs zero chrome on the
 * normal "glance at the fleet" flow. It is positioned in the top-right corner
 * directly below the Mapbox zoom stack so it reads as the third button in
 * that control group (Mapbox's native controls and React children render in
 * separate layers and can't be literally interleaved).
 */
export function MapResetButton({ onReset }: MapResetButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onReset}
          aria-label="Reset to fleet view"
          className="absolute right-2.5 top-[88px] z-10 h-[29px] w-[29px] border-border bg-card/90 shadow-sm backdrop-blur-sm hover:bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Reset to fleet view</TooltipContent>
    </Tooltip>
  );
}
