'use client';

import { useMemo } from 'react';

import { Skeleton } from '@/shared/components/ui/skeleton';

import { useMemories } from '../../../hooks/use-memories';
import { MEMORY_SCOPE_LABELS } from '../../../constants';
import type { AgentKey, MemoryRecord } from '../../../types';

import { MemoryCard } from './memory-card';

interface MemoryTabProps {
  agentKey: AgentKey;
  canEdit: boolean;
  supervisorFirstName?: string | null;
}

/**
 * Memory tab — what Sally has learned on her own (LLM-extracted entity +
 * pattern memories). Operator-authored playbook rules live on the
 * sibling **Rules tab** — same data table, different
 * `authoredByOperatorOnly` filter. The split is intent-vs-observation:
 * Memory = "things Sally figured out", Rules = "things I told Sally to do".
 */
export function MemoryTab({ agentKey, canEdit, supervisorFirstName }: MemoryTabProps) {
  const { data, isLoading } = useMemories({
    agentKey,
    activeOnly: true,
    // Memory tab shows LLM-extracted rows only; operator-authored
    // playbook entries belong to the Rules tab.
    authoredByOperatorOnly: false,
    limit: 100,
  });

  const groups = useMemo(() => groupByScope(data?.rows ?? []), [data?.rows]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`skeleton-${i}`} className="h-24 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const total = (data?.rows ?? []).length;

  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Sally hasn&apos;t learned anything for this agent yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Lessons accumulate as you edit, reject, or close episodes successfully.
        </p>
      </div>
    );
  }

  const lockedTooltip = supervisorFirstName
    ? `Only ${supervisorFirstName} or an admin can edit this agent's memory.`
    : "Only the agent's supervisor or an admin can edit this memory.";

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{total}</span> {total === 1 ? 'lesson' : 'lessons'} learned
      </p>

      {groups.map(({ scope, rows }) => (
        <section key={scope}>
          <header className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {MEMORY_SCOPE_LABELS[scope]}
              <span className="ml-1.5 text-muted-foreground/70">({rows.length})</span>
            </h4>
          </header>
          <ul className="space-y-3">
            {rows.map((m) => (
              <MemoryCard key={m.id} memory={m} canEdit={canEdit} lockedTooltip={lockedTooltip} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Group rows by scope. Stable order: Subjects (ENTITY) first because
 * dispatchers think in customers; then Patterns (PATTERN). PLAYBOOK
 * rows are excluded — they belong to the Rules tab.
 */
function groupByScope(rows: MemoryRecord[]): Array<{ scope: 'ENTITY' | 'PATTERN'; rows: MemoryRecord[] }> {
  const buckets: Record<'ENTITY' | 'PATTERN', MemoryRecord[]> = { ENTITY: [], PATTERN: [] };
  for (const row of rows) {
    if (row.scope === 'ENTITY' || row.scope === 'PATTERN') {
      buckets[row.scope].push(row);
    }
  }
  return (['ENTITY', 'PATTERN'] as const)
    .filter((s) => buckets[s].length > 0)
    .map((scope) => ({ scope, rows: buckets[scope] }));
}
