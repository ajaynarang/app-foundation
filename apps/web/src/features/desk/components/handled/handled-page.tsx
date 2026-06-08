'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import { Skeleton } from '@/shared/components/ui/skeleton';

import { useAuthStore } from '@/features/auth/store';

import { useAgents } from '../../hooks/use-agents';
import { useHandoffCounts } from '../../hooks/use-approvals';
import { useHandledEpisodes } from '../../hooks/use-episodes';
import { chooseEmptyStateVariant } from '../../lib/handled-empty-state-variant';
import type { ApprovalScope, HandledWindow } from '../../types';

import { HandledEmptyState } from './handled-empty-state';
import { HandledRow } from './handled-row';
import { HandledSummaryStrip } from './handled-summary-strip';
import { HandledToolbar } from './handled-toolbar';

const SUPERVISOR_ROLES = new Set(['DISPATCHER']);
const VALID_WINDOWS: ReadonlyArray<HandledWindow> = ['today', '7d', '30d', 'this_month', 'custom'];

/**
 * Timeline of Sally's handled work. All filters (scope, window, agent,
 * outcome, search, custom range) live in the URL — reload / share /
 * back-stack all work out of the box. Live queue counts drive the
 * empty-state variant ("Quiet morning" vs "Nothing closed today yet"
 * vs onboarding copy vs general).
 */
export function HandledPage() {
  const params = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const urlScope = params.get('scope');
  const defaultScope: ApprovalScope = user && SUPERVISOR_ROLES.has(user.role) ? 'mine' : 'all';
  const scope: ApprovalScope = urlScope === 'mine' || urlScope === 'all' ? urlScope : defaultScope;

  const urlWindow = params.get('window');
  const window: HandledWindow = VALID_WINDOWS.includes(urlWindow as HandledWindow)
    ? (urlWindow as HandledWindow)
    : 'today';

  const agent = params.get('agent') ?? undefined;
  const outcome = params.get('outcome') ?? undefined;
  const q = params.get('q') ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;

  const { data, isLoading } = useHandledEpisodes({ scope, window, agent, outcome, q, from, to, limit: 50 });
  const { data: counts } = useHandoffCounts();
  const agents = useAgents();

  const rows = data?.rows ?? [];
  const liveHasRows = (counts?.all.waiting ?? 0) + (counts?.all.escalated ?? 0) > 0;

  // Derive tenant age from the current user's createdAt. When unavailable
  // (auth hydration, older users without the field), fall back to a value
  // large enough that the "new tenant" copy does NOT trigger — onboarding
  // copy is the narrower case and should stay behind a positive signal.
  // TODO(T28): backfill with a dedicated tenant.createdAt source (the
  // current user was not necessarily the first member of the tenant).
  const tenantAgeDays = useMemo(() => ageDaysFromIso(user?.createdAt), [user?.createdAt]);

  const variant = chooseEmptyStateVariant({
    window,
    now: new Date(),
    liveHasRows,
    tenantAgeDays,
  });

  return (
    <div className="space-y-4">
      <HandledToolbar
        scope={scope}
        window={window}
        agent={agent}
        outcome={outcome}
        q={q}
        from={from}
        to={to}
        agents={agents.data ?? []}
      />

      {data?.summary && rows.length > 0 && (
        <HandledSummaryStrip
          total={data.summary.total}
          byOutcome={data.summary.byOutcome}
          autonomousPct={data.summary.autonomousPct}
          window={window}
        />
      )}

      {isLoading ? (
        <HandledListSkeleton />
      ) : rows.length === 0 ? (
        <HandledEmptyState variant={variant} />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <HandledRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function HandledListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Returns the number of whole days between `iso` and now. When the
 * value is missing or unparseable, returns 14 — a deliberately
 * non-onboarding value so the "new tenant" copy only fires when we have
 * a positive, recent signal.
 */
function ageDaysFromIso(iso?: string): number {
  const FALLBACK = 14;
  if (!iso) return FALLBACK;
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return FALLBACK;
  return Math.floor((Date.now() - created.getTime()) / 86_400_000);
}
