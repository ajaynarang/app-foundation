'use client';

import { Search } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Input } from '@/shared/components/ui/input';

import type { AgentRosterItem } from '../../types';

interface CrewToolbarProps {
  agents: AgentRosterItem[];
  sortBy: CrewSortKey;
  onSortChange: (next: CrewSortKey) => void;
  searchQuery: string;
  onSearchChange: (next: string) => void;
}

export type CrewSortKey = 'most-active' | 'alphabetical';

const SORT_LABELS: Record<CrewSortKey, string> = {
  'most-active': 'Most active',
  alphabetical: 'Alphabetical',
};

/**
 * Crew tab header — count summary + sort dropdown + search. Per-agent
 * filter was dropped: Crew already lists every agent, so filtering to
 * one is noise.
 */
export function CrewToolbar({ agents, sortBy, onSortChange, searchQuery, onSearchChange }: CrewToolbarProps) {
  const activeCount = agents.filter((a) => a.availableResponsibilityCount > 0).length;
  const comingSoonCount = agents.length - activeCount;

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{activeCount}</span> active
        </span>
        <span>·</span>
        <span>
          <span className="font-medium text-foreground">{comingSoonCount}</span> coming soon
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search agents…"
            className="h-9 pl-8 text-sm"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="whitespace-nowrap">
              Sort: {SORT_LABELS[sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => onSortChange(v as CrewSortKey)}>
              <DropdownMenuRadioItem value="most-active">Most active</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="alphabetical">Alphabetical</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
