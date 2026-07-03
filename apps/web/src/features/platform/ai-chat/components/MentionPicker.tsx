'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import { Command, CommandGroup, CommandItem, CommandList } from '@app/ui/components/ui/command';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import type { SearchApiResult } from '@appshore/web-core/shared/lib/search';

/** Title-case a backend entity `type` discriminator into a group heading. */
function groupLabel(type: string): string {
  if (!type) return 'Results';
  const titled = type.charAt(0).toUpperCase() + type.slice(1);
  return titled.endsWith('s') ? titled : `${titled}s`;
}

export interface MentionPickerProps {
  results: SearchApiResult[];
  isLoading: boolean;
  /** True once the (debounced) query is long enough to search. */
  hasQuery: boolean;
  activeIndex: number;
  onSelect: (result: SearchApiResult) => void;
  onHover: (index: number) => void;
}

export function MentionPicker({ results, isLoading, hasQuery, activeIndex, onSelect, onHover }: MentionPickerProps) {
  // Group dynamically by whatever entity `type`s the backend returns, in the
  // order they first appear. Stable flat order so the keyboard index lines up
  // with grouped rendering.
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const r of results) {
      if (!seen.includes(r.type)) seen.push(r.type);
    }
    return seen;
  }, [results]);
  const ordered = useMemo(() => groups.flatMap((t) => results.filter((r) => r.type === t)), [groups, results]);

  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Four distinct states, so the user never sees a bare "No matches" the
  // instant they type "@":
  //   1. no query yet      → a helper hint ("Type to search…")
  //   2. loading first hit  → skeleton rows
  //   3. searched, empty    → "No matches."
  //   4. results            → grouped rows
  const showHint = !hasQuery;
  const showSkeleton = hasQuery && isLoading && ordered.length === 0;
  const showEmpty = hasQuery && !isLoading && ordered.length === 0;

  return (
    <div
      data-mention-picker="open"
      className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
    >
      <Command shouldFilter={false} className="bg-transparent">
        <CommandList className="max-h-[340px]">
          {showHint ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span>Type to search…</span>
            </div>
          ) : showSkeleton ? (
            <div className="space-y-2 p-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              ))}
            </div>
          ) : showEmpty ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">No matches.</div>
          ) : (
            <>
              {groups.map((type) => {
                const rows = results.filter((r) => r.type === type);
                if (rows.length === 0) return null;
                return (
                  <CommandGroup key={type} heading={groupLabel(type)}>
                    {rows.map((row) => {
                      const index = ordered.indexOf(row);
                      const isActive = index === activeIndex;
                      return (
                        <CommandItem
                          key={`${row.type}:${row.id}`}
                          value={`${row.type}:${row.id}`}
                          onSelect={() => onSelect(row)}
                          onMouseMove={() => onHover(index)}
                          ref={isActive ? activeRef : undefined}
                          data-active={isActive}
                          className="flex flex-col items-start gap-0.5 data-[active=true]:bg-accent"
                        >
                          <span className="text-sm font-medium text-foreground">{row.label}</span>
                          {row.description && <span className="text-xs text-muted-foreground">{row.description}</span>}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
