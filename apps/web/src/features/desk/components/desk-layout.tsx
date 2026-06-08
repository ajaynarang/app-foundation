'use client';

import { ArrowLeft, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/shared/components/ui/button';
import {
  PageHeader,
  PageTabs,
  PageTabsList,
  PageTabsTrigger,
  PageToolbar,
  TabsContent,
} from '@/shared/components/page-chrome';

import { useAuthStore } from '@/features/auth/store';

import { useAgents } from '../hooks/use-agents';
import { useHandoffCounts } from '../hooks/use-approvals';
import { DESK_TABS, type DeskTab } from '../store/desk-store';
import type { ApprovalScope } from '../types';

import { HandoffsPage } from './handoffs/handoffs-page';
import { HandledPage } from './handled/handled-page';
import { CrewPage } from './crew/crew-page';
import { EpisodeSheet } from './episode/episode-sheet';
import { AgentSheet } from './crew/agent-sheet';

// Needs you / Handled are the live work queue — pending vs. done. The agent
// roster is a standing directory, so it lives behind a header link rather
// than a peer tab. Both queue views are real tabs; `?tab=agents` still
// resolves to the roster so existing deep links keep working.
const QUEUE_TABS = new Set<DeskTab>([DESK_TABS.HANDOFFS, DESK_TABS.HANDLED]);
const SUPERVISOR_ROLES = new Set(['DISPATCHER']);

/**
 * Sally's Desk top-level shell. Two peer tabs hold the live work queue —
 * Needs you (work that needs a human) and Handled (what the agents already
 * closed). The agent roster is reference material, reached via the "Agents"
 * link in the header (`?tab=agents`).
 *
 * The URL's `?tab=` param is the canonical source of truth — a deep-linked
 * Handled or Agents view reloads exactly where it was. Detail surfaces
 * (episode sheet, agent sheet) live alongside so any view can open them.
 */
export function DeskLayout() {
  const router = useRouter();
  const params = useSearchParams();
  const urlTab = params.get('tab') as DeskTab | null;
  const onAgents = urlTab === DESK_TABS.CREW;
  const activeTab: DeskTab = urlTab && QUEUE_TABS.has(urlTab) ? urlTab : DESK_TABS.HANDOFFS;

  const setTab = (next: DeskTab) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('tab', next);
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  // Badge count reflects the scope the dispatcher lands on by default
  // (DISPATCHER → mine, everyone else → all), matching the URL-persisted
  // scope both list views read. Adding mine + all would double-count every
  // row a DISPATCHER already owns (it's in both buckets), showing `(2)`
  // for a single approval — the bug that surfaced during browser verify.
  const user = useAuthStore((s) => s.user);
  const { data: counts } = useHandoffCounts();
  const defaultScope: ApprovalScope = user && SUPERVISOR_ROLES.has(user.role) ? 'mine' : 'all';
  const urlScope = params.get('scope') as ApprovalScope | null;
  const scope: ApprovalScope = urlScope === 'mine' || urlScope === 'all' ? urlScope : defaultScope;

  const bucket = counts?.[scope];
  const needsYou = (bucket?.waiting ?? 0) + (bucket?.escalated ?? 0);
  const handledToday = counts?.handled?.today[scope] ?? 0;

  // Roster is shared with CrewPage's useAgents() — TanStack dedupes by key,
  // so reading the active count here costs no extra request.
  const { data: agents } = useAgents();
  const activeAgents = agents?.filter((a) => a.availableResponsibilityCount > 0).length ?? 0;

  // The agent roster is reference material — reached via the toolbar "Agents"
  // action, not a peer nav tab. So the roster view is a no-tabs page (header +
  // a "Back to desk" action), while the queue view carries the underline tabs.
  if (onAgents) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Sally's Desk"
          subtitle="What your agents handled, what needs you"
          actions={
            <Button variant="outline" size="sm" onClick={() => setTab(DESK_TABS.HANDOFFS)}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to desk
            </Button>
          }
        />
        <CrewPage />
        <EpisodeSheet />
        <AgentSheet />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sally's Desk" subtitle="What your agents handled, what needs you" hasTabs />

      <PageTabs value={activeTab} onValueChange={(v) => setTab(v as DeskTab)} className="space-y-6">
        <PageToolbar
          tabs={
            <PageTabsList>
              <PageTabsTrigger value={DESK_TABS.HANDOFFS} count={needsYou > 0 ? needsYou : undefined}>
                Needs you
              </PageTabsTrigger>
              <PageTabsTrigger value={DESK_TABS.HANDLED} count={handledToday > 0 ? handledToday : undefined}>
                Handled
              </PageTabsTrigger>
            </PageTabsList>
          }
          secondaryActions={
            <Button variant="outline" size="sm" onClick={() => setTab(DESK_TABS.CREW)}>
              <Users className="mr-2 h-4 w-4" aria-hidden />
              Agents
              {activeAgents > 0 ? <span className="ml-1.5 text-muted-foreground">{activeAgents} active</span> : null}
            </Button>
          }
        />

        <TabsContent value={DESK_TABS.HANDOFFS}>
          <HandoffsPage />
        </TabsContent>
        <TabsContent value={DESK_TABS.HANDLED}>
          <HandledPage />
        </TabsContent>
      </PageTabs>

      <EpisodeSheet />
      <AgentSheet />
    </div>
  );
}
