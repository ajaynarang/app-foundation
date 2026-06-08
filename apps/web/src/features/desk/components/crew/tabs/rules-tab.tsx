'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

import { AGENT_RULE_PLACEHOLDERS, DEFAULT_RULE_PLACEHOLDER } from '../../../constants';
import { useAddPlaybookRule, useMemories } from '../../../hooks/use-memories';
import { useResponsibilities, useResponsibility, useResponsibilityUISpec } from '../../../hooks/use-responsibilities';
import { summarizeConditions } from '../../../lib/summarize-conditions';
import type { AgentKey } from '../../../types';

import { MemoryCard } from './memory-card';

interface RulesTabProps {
  agentKey: AgentKey;
  canEdit: boolean;
  supervisorFirstName?: string | null;
}

const MAX_RULE_CHARS = 2000;

/**
 * Rules tab — what the operator deliberately set ("things I told Sally to do").
 *
 * Two sections:
 *   1. **Conditions**  — read-only summary of every available
 *      responsibility's structured conditions (set on the
 *      Responsibilities tab / Settings). Surfaced here so a dispatcher
 *      asking "why did Sally do that?" finds both kinds of rules in one
 *      place without hunting across pages.
 *   2. **Your rules**  — operator-authored playbook memories from the
 *      DeskMemory table (`scope='PLAYBOOK' AND authoredByUserId IS NOT NULL`).
 *      Editable, pinnable, removable. Authored via the "Add a rule" form
 *      below the list.
 *
 * Mental model:  Rules = intent  ·  Memory tab = observation.
 */
export function RulesTab({ agentKey, canEdit, supervisorFirstName }: RulesTabProps) {
  const playbook = useMemories({
    agentKey,
    activeOnly: true,
    authoredByOperatorOnly: true,
    limit: 100,
  });
  const responsibilitiesList = useResponsibilities();

  const ownedResponsibilities = useMemo(
    () => (responsibilitiesList.data ?? []).filter((r) => r.agentKey === agentKey),
    [responsibilitiesList.data, agentKey],
  );

  if (playbook.isLoading || responsibilitiesList.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`skeleton-${i}`} className="h-20 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const rules = playbook.data?.rows ?? [];
  const lockedTooltip = supervisorFirstName
    ? `Only ${supervisorFirstName} or an admin can manage rules for this agent.`
    : "Only the agent's supervisor or an admin can manage rules.";

  return (
    <div className="space-y-6">
      {/* ─── Structured conditions (read-only summary) ─── */}
      <section>
        <header className="mb-2">
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Conditions <span className="text-muted-foreground/70">(set in Responsibilities)</span>
          </h4>
        </header>
        {ownedResponsibilities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No responsibilities assigned to this agent yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {ownedResponsibilities.map((r) => (
              <ResponsibilityConditionsRow key={r.key} responsibilityKey={r.key} title={r.title} />
            ))}
          </ul>
        )}
      </section>

      {/* ─── Free-form playbook rules ─── */}
      <section>
        <header className="mb-2">
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Your rules{rules.length > 0 ? ` (${rules.length})` : ''}
          </h4>
        </header>
        {rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No free-form rules yet — Sally only follows the structured conditions above until you add one.
          </p>
        ) : (
          <ul className="space-y-3">
            {rules.map((m) => (
              <MemoryCard key={m.id} memory={m} canEdit={canEdit} lockedTooltip={lockedTooltip} />
            ))}
          </ul>
        )}

        <AddRuleForm agentKey={agentKey} canEdit={canEdit} lockedTooltip={lockedTooltip} />
      </section>
    </div>
  );
}

function ResponsibilityConditionsRow({ responsibilityKey, title }: { responsibilityKey: string; title: string }) {
  const detail = useResponsibility(responsibilityKey);
  const uiSpec = useResponsibilityUISpec(responsibilityKey);
  const summary =
    detail.data && uiSpec.data?.conditionsUI
      ? summarizeConditions(uiSpec.data.conditionsUI, detail.data.conditions as Record<string, unknown>)
      : null;
  return (
    <li className="rounded-md border border-border bg-card/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{summary ?? '—'}</span>
      </div>
    </li>
  );
}

function AddRuleForm({
  agentKey,
  canEdit,
  lockedTooltip,
}: {
  agentKey: AgentKey;
  canEdit: boolean;
  lockedTooltip: string;
}) {
  const [draft, setDraft] = useState('');
  const addRule = useAddPlaybookRule();

  const trimmed = draft.trim();
  const canSubmit = canEdit && trimmed.length > 0 && trimmed.length <= MAX_RULE_CHARS;

  const button = (
    <Button
      onClick={() => addRule.mutate({ agentKey, content: trimmed }, { onSuccess: () => setDraft('') })}
      disabled={!canSubmit}
      loading={addRule.isPending}
      size="sm"
    >
      <Plus className="mr-1 h-3.5 w-3.5" /> Add rule
    </Button>
  );

  return (
    <div className="mt-4 space-y-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={AGENT_RULE_PLACEHOLDERS[agentKey] ?? DEFAULT_RULE_PLACEHOLDER}
        rows={3}
        maxLength={MAX_RULE_CHARS + 100}
        disabled={!canEdit}
        aria-label="New playbook rule"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-foreground">
          {trimmed.length}/{MAX_RULE_CHARS}
        </span>
        {canEdit ? (
          button
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{button}</span>
            </TooltipTrigger>
            <TooltipContent>{lockedTooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
