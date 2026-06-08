'use client';

import { cn } from '@sally/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { SCOPE_DESCRIPTIONS } from '@sally/shared-types';
import type { AgentScope } from '@sally/shared-types';
import { scopeChipClass } from '../utils/scope-copy';

interface ScopeChipProps {
  scope: AgentScope;
  className?: string;
  /** If true, renders without the tooltip (use inside tooltips to avoid nesting). */
  noTooltip?: boolean;
}

/**
 * Compact badge for a single scope. Colour is keyed to the scope's HITL
 * tier (none / standard / sensitive) and is dark-mode safe. Hovering
 * reveals the one-line summary from SCOPE_DESCRIPTIONS.
 */
export function ScopeChip({ scope, className, noTooltip }: ScopeChipProps) {
  const chipClass = cn(
    'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono',
    scopeChipClass(scope),
    className,
  );
  const summary = SCOPE_DESCRIPTIONS[scope]?.summary ?? scope;

  if (noTooltip) {
    return <span className={chipClass}>{scope}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={chipClass}>{scope}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{summary}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
