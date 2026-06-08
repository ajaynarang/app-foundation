'use client';

import { DollarSign, Clock } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';

interface StopNudgeProps {
  type: 'lumper' | 'detention';
  hoursAtDock?: number;
  onAction: () => void;
}

export function StopNudge({ type, hoursAtDock, onAction }: StopNudgeProps) {
  if (type === 'lumper') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-400/5 border border-green-400/20">
        <DollarSign className="h-3.5 w-3.5 text-green-400 shrink-0" />
        <p className="text-xs text-muted-foreground flex-1">Need lumper service?</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-green-400 hover:text-green-300"
          onClick={onAction}
        >
          Request Funds
        </Button>
      </div>
    );
  }

  const hours = Math.floor(hoursAtDock ?? 0);
  const minutes = Math.round(((hoursAtDock ?? 0) - hours) * 60);

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-400/5 border border-yellow-400/20">
      <Clock className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
      <p className="text-xs text-muted-foreground flex-1">
        {hours}h {minutes}m at dock — report detention?
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-yellow-400 hover:text-yellow-300"
        onClick={onAction}
      >
        Report
      </Button>
    </div>
  );
}
