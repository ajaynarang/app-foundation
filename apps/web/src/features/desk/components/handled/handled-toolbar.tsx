'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';

import type { AgentRosterItem, ApprovalScope, HandledWindow } from '../../types';

import { HandledWindowDropdown } from './handled-window-dropdown';

interface HandledToolbarProps {
  scope: ApprovalScope;
  window: HandledWindow;
  agent?: string;
  outcome?: string;
  q?: string;
  from?: string;
  to?: string;
  agents: AgentRosterItem[];
}

/**
 * Sentinel for the "all" case of the agent + outcome select boxes —
 * Shadcn Select items cannot have an empty `value`, so we encode "any"
 * as a literal sentinel and strip it before pushing to the URL.
 */
const ANY = '__any__' as const;

const OUTCOME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ANY, label: 'Any outcome' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'followup_sent', label: 'Follow-up sent' },
  { value: 'promise_recorded', label: 'Promise recorded' },
  { value: 'invoice_paid', label: 'Invoice paid' },
  { value: 'no_action_needed', label: 'No action needed' },
  { value: 'approval_expired', label: 'Expired' },
  { value: 'rejected_by_operator', label: 'Rejected' },
  { value: 'escalated_to_human', label: 'Escalated' },
];

const SCOPE_OPTIONS: Array<{ value: ApprovalScope; label: string }> = [
  { value: 'mine', label: 'Mine' },
  { value: 'all', label: 'All' },
];

/**
 * URL-driven toolbar for the Handled tab. Every control writes to
 * `useSearchParams` via `router.replace`; the page reads back from the
 * same source of truth so filters survive refresh, sharing, and
 * browser back-stack.
 *
 * Responsive: wraps to multiple rows below `sm:`. Search debounces at
 * 250ms so every keystroke does not refetch.
 */
export function HandledToolbar({ scope, window, agent, outcome, q, from, to, agents }: HandledToolbarProps) {
  const router = useRouter();
  const params = useSearchParams();

  const [searchDraft, setSearchDraft] = useState(q ?? '');
  useEffect(() => setSearchDraft(q ?? ''), [q]);

  // Debounced search → URL
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (current === searchDraft) return;
    const t = setTimeout(() => writeParams({ q: searchDraft || undefined }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  function writeParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(Array.from(params.entries()));
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  const setScope = (next: ApprovalScope) => writeParams({ scope: next });
  const setAgent = (next: string) => writeParams({ agent: next === ANY ? undefined : next });
  const setOutcome = (next: string) => writeParams({ outcome: next === ANY ? undefined : next });
  const setWindow = (next: { window: HandledWindow; from?: string; to?: string }) =>
    writeParams({ window: next.window, from: next.from, to: next.to });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Handled scope"
          className="inline-flex items-center rounded-md border border-border bg-card p-0.5"
        >
          {SCOPE_OPTIONS.map((opt) => {
            const active = opt.value === scope;
            return (
              <Button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                variant={active ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setScope(opt.value)}
                className="h-7 px-2.5 text-xs font-medium"
              >
                {opt.label}
              </Button>
            );
          })}
        </div>

        <span aria-hidden className="hidden h-5 w-px bg-border sm:inline-block" />

        <HandledWindowDropdown value={window} from={from} to={to} onChange={setWindow} />

        <Select value={agent ?? ANY} onValueChange={setAgent}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filter by agent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.key} value={a.key}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={outcome ?? ANY} onValueChange={setOutcome}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filter by outcome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Input
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        placeholder="Search entity or responsibility…"
        className="h-9 w-full sm:w-72"
        aria-label="Search handled episodes"
      />
    </div>
  );
}
