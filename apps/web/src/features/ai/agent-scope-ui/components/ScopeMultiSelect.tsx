'use client';

import { useMemo, useState } from 'react';
import { AgentScopeSchema, NEVER_EXTERNAL_SCOPES, SCOPE_DESCRIPTIONS } from '@app/shared-types';
import type { AgentScope } from '@app/shared-types';
import { Button } from '@app/ui/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@app/ui/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@app/ui/components/ui/popover';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@app/ui';
import { ScopeChip } from './ScopeChip';
import { groupScopesByDomain } from '../utils/scope-copy';

const NEVER_SET: ReadonlySet<string> = new Set(NEVER_EXTERNAL_SCOPES);

interface ScopeMultiSelectProps {
  value: AgentScope[];
  onChange: (next: AgentScope[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Combobox multi-select for agent scopes. Grouped by domain prefix
 * (fleet, loads, invoices, etc.). Filters out NEVER_EXTERNAL_SCOPES
 * (platform:admin) so they cannot be chosen at all.
 */
export function ScopeMultiSelect({ value, onChange, disabled, placeholder = 'Add scope…' }: ScopeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const allScopes = useMemo(() => AgentScopeSchema.options.filter((s) => !NEVER_SET.has(s)) as AgentScope[], []);
  const grouped = useMemo(() => groupScopesByDomain(allScopes), [allScopes]);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggle = (scope: AgentScope) => {
    if (selectedSet.has(scope)) {
      onChange(value.filter((s) => s !== scope));
    } else {
      onChange([...value, scope]);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="text-muted-foreground">
              {value.length === 0 ? placeholder : `${value.length} scope${value.length === 1 ? '' : 's'} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={true}>
            <CommandInput placeholder="Search scopes…" />
            <CommandList className="max-h-[320px] overflow-y-auto overscroll-contain">
              <CommandEmpty>No scopes found.</CommandEmpty>
              {Object.keys(grouped)
                .sort()
                .map((domain) => (
                  <CommandGroup key={domain} heading={domain}>
                    {grouped[domain].map((scope) => {
                      const desc = SCOPE_DESCRIPTIONS[scope];
                      const checked = selectedSet.has(scope);
                      return (
                        <CommandItem
                          key={scope}
                          value={scope}
                          keywords={desc?.summary ? [scope, desc.summary] : [scope]}
                          onSelect={() => toggle(scope)}
                          className="flex items-start gap-2"
                        >
                          <Check className={cn('mt-1 h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')} />
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono text-xs">{scope}</span>
                            {desc?.summary ? (
                              <span className="text-xs text-muted-foreground">{desc.summary}</span>
                            ) : null}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((scope) => (
            <button
              type="button"
              key={scope}
              onClick={() => toggle(scope)}
              disabled={disabled}
              className="group inline-flex items-center gap-1"
              aria-label={`Remove ${scope}`}
            >
              <ScopeChip scope={scope} noTooltip />
              <X className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
