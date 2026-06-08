'use client';

import { formatLoadLabel } from '@sally/shared-types';
import { Button } from '@sally/ui/components/ui/button';
import { Check, X } from 'lucide-react';
import type { SallySuggestion } from '@/features/horizon/types';

interface SuggestionBlockProps {
  suggestion: SallySuggestion;
  onAccept: (suggestion: SallySuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}

export function SuggestionBlock({ suggestion, onAccept, onDismiss }: SuggestionBlockProps) {
  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 dark:bg-primary/10 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-medium text-primary">
          ✦ {formatLoadLabel(suggestion.loadNumber, suggestion.referenceNumber)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onAccept(suggestion)}
            title="Accept suggestion"
          >
            <Check className="h-3 w-3 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onDismiss(suggestion.suggestionId)}
            title="Dismiss"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <div className="truncate text-2xs text-muted-foreground">{suggestion.route}</div>
      {/* Transparent scoring — show WHY Sally recommends this */}
      <div className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <span className="font-medium text-primary">{suggestion.matchScore}%</span>
        <span>·</span>
        <span>{suggestion.reason}</span>
      </div>
    </div>
  );
}
