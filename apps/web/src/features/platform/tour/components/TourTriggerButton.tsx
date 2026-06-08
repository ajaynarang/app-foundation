'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { useTour } from '../hooks/use-tour';

interface TourTriggerButtonProps {
  isCollapsed: boolean;
}

export function TourTriggerButton({ isCollapsed }: TourTriggerButtonProps) {
  const { startTour } = useTour();

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={startTour}
            className="w-full h-auto py-2 text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Sally, Show Me Around
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={startTour}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full justify-start h-auto"
    >
      <Sparkles className="h-5 w-5 flex-shrink-0" />
      <span className="flex-1 text-left">Sally, Show Me Around</span>
    </Button>
  );
}
