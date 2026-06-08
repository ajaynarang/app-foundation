'use client';

import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { cn } from '@/shared/lib/utils';

import {
  AGENT_FILTER_ALL,
  HANDOFF_FILTERS,
  useDeskStore,
  type AgentFilterValue,
  type HandoffFilter,
} from '../../store/desk-store';
import type { AgentRosterItem } from '../../types';

interface HandoffFiltersProps {
  counts: { allKinds: number; waitingApproval: number; escalated: number };
  agents: AgentRosterItem[];
}

const FILTER_OPTIONS: Array<{
  value: HandoffFilter;
  label: string;
  countKey: keyof HandoffFiltersProps['counts'];
}> = [
  { value: HANDOFF_FILTERS.ALL, label: 'Any', countKey: 'allKinds' },
  {
    value: HANDOFF_FILTERS.WAITING_APPROVAL,
    label: 'Waiting',
    countKey: 'waitingApproval',
  },
  {
    value: HANDOFF_FILTERS.ESCALATED,
    label: 'Escalated',
    countKey: 'escalated',
  },
];

/**
 * Kind filter (Any / Waiting / Escalated) + Agent select. The counts here
 * are derived from the active-scope rows — distinct from the Mine/All
 * scope counts in HandoffsScopeToggle. Ghost-button styling was hard to
 * parse against the black scope-toggle chips at the same row; the count
 * pill now reads as a faint badge glued to its label (no ambiguous "Any 1"
 * two-token look).
 */
export function HandoffFilters({ counts, agents }: HandoffFiltersProps) {
  const handoffFilter = useDeskStore((s) => s.handoffFilter);
  const setHandoffFilter = useDeskStore((s) => s.setHandoffFilter);
  const agentFilter = useDeskStore((s) => s.agentFilter);
  const setAgentFilter = useDeskStore((s) => s.setAgentFilter);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTER_OPTIONS.map((opt) => {
        const active = handoffFilter === opt.value;
        const count = counts[opt.countKey];
        return (
          <Button
            key={opt.value}
            type="button"
            variant={active ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setHandoffFilter(opt.value)}
            className="h-8 gap-1.5 px-2.5 text-xs font-medium"
          >
            <span>{opt.label}</span>
            <span
              className={cn(
                'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums',
                active ? 'bg-foreground/10 text-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {count}
            </span>
          </Button>
        );
      })}

      <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentFilterValue)}>
        <SelectTrigger className="ml-1 h-8 w-40 text-xs">
          <SelectValue placeholder="All agents" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AGENT_FILTER_ALL}>All agents</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.key} value={a.key}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
