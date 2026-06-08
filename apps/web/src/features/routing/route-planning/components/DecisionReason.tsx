'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import type { RouteSegment } from '../types';
import { DecisionFeedback } from './DecisionFeedback';

interface DecisionReasonProps {
  segment: RouteSegment;
  planId: string;
}

function getBorderColor(segmentType: string): string {
  switch (segmentType) {
    case 'rest':
      return 'border-l-violet-500 dark:border-l-violet-400';
    case 'fuel':
      return 'border-l-caution';
    case 'break':
      return 'border-l-emerald-500 dark:border-l-emerald-400';
    default:
      return 'border-l-border';
  }
}

function getBackgroundColor(segmentType: string): string {
  switch (segmentType) {
    case 'rest':
      return 'bg-violet-500/5 dark:bg-violet-400/5';
    case 'fuel':
      return 'bg-caution/5';
    case 'break':
      return 'bg-emerald-500/5 dark:bg-emerald-400/5';
    default:
      return 'bg-muted/30';
  }
}

export function DecisionReason({ segment, planId }: DecisionReasonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!segment.decisionReason) return null;

  const reason = segment.decisionReason;

  return (
    <div className="mt-2">
      <Button
        variant="outline"
        size="sm"
        className={`h-7 text-[11px] px-2.5 gap-1 text-muted-foreground ${isOpen ? 'bg-muted/50' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        Why
      </Button>

      {isOpen && (
        <div
          className={`mt-2 p-2.5 rounded-md border-l-[3px] ${getBorderColor(
            segment.segmentType,
          )} ${getBackgroundColor(segment.segmentType)} animate-in fade-in slide-in-from-top-1 duration-200`}
        >
          <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Sally&apos;s reasoning</div>
          <div className="text-xs text-foreground font-medium">{reason.summary}</div>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{reason.details}</div>
          <DecisionFeedback planId={planId} segmentId={segment.segmentId} />
        </div>
      )}
    </div>
  );
}
