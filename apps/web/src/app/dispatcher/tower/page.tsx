'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Sheet, SheetContent } from '@sally/ui/components/ui/sheet';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { useLoadById } from '@/features/fleet/loads/hooks/use-loads';
import { LoadDetailPanel } from '@/features/fleet/loads/components/LoadDetailPanel';
import { useShiftNotes } from '@/features/operations/tower/hooks/use-shift-notes';
import { ConversationSheet } from '@/features/operations/tower/components/ConversationSheet';
import { TowerTopbar } from '@/features/operations/tower/components/topbar/tower-topbar';
import { HotkeysSheet } from '@/features/operations/tower/components/topbar/hotkeys-sheet';
import { TowerControlRow } from '@/features/operations/tower/components/tower-control-row';
import { TowerSpine } from '@/features/operations/tower/components/tower-spine/tower-spine';
import type { SpineView } from '@/features/operations/tower/components/tower-spine/spine-view-toggle';
import type { RiskFilter } from '@/features/operations/tower/constants';
import { Wire } from '@/features/operations/tower/components/wire/wire';
import { WireAriaLive } from '@/features/operations/tower/components/wire/wire-aria-live';
import { PaneRouter } from '@/features/operations/tower/components/pane-router/pane-router';
import { TowerInteractionProvider } from '@/features/operations/tower/context/tower-interaction.context';
import { useLookaheadPreference } from '@/features/operations/tower/hooks/use-lookahead-preference';
import { useRiskScores } from '@/features/operations/tower/hooks/use-risk-scores';
import { useTowerEvents } from '@/features/operations/tower/hooks/use-tower-events';
import { usePaneRouter } from '@/features/operations/tower/hooks/use-pane-router';
import { useTowerLayout } from '@/features/operations/tower/hooks/use-tower-layout';
import { useTowerHotkeys } from '@/features/operations/tower/hooks/use-tower-hotkeys';

// Map is heavy (mapbox-gl) — load client-only with a footprint-matching skeleton.
const TowerMap = dynamic(
  () => import('@/features/operations/tower/components/tower-map/tower-map').then((mod) => mod.TowerMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  },
);

/**
 * Tower v3 canvas — sticky topbar over an adaptive workspace:
 *  - Spine (Drivers / Active-loads tabs) · Map (risk-coded) · Wire (feed)
 *
 * The `PaneRouter` picks the layout off the window width — full 3-column,
 * tight 3-column, adaptive 2-pane, or a handoff screen below 900px. In
 * 3-column layout the Spine and Wire are fully hideable (IDE-style topbar
 * toggles); the global Sally launcher and one global hotkey listener drive
 * Sally + every shortcut.
 */
export default function DispatcherTowerPage() {
  return (
    <FeatureGuard featureKey="command_center">
      <TowerCanvas />
    </FeatureGuard>
  );
}

function TowerCanvas() {
  const router = useRouter();
  const { lookaheadHours, setLookaheadHours } = useLookaheadPreference();

  // Real-time wiring: TOWER_* SSE events patch/invalidate the tower caches.
  // Mounted once here so the whole canvas shares one set of subscriptions.
  useTowerEvents();

  // Risk scores feed the map's marker filtering; each pane also reads its own
  // copy from the cache, so this is dedup'd at the TanStack layer.
  const { data: riskScores } = useRiskScores(lookaheadHours);

  // Handoff status — the real signal. Sally has no shift-schedule model (no
  // per-tenant/per-dispatcher shift table), so there is no true "shift ends
  // in N hours" countdown — see issue #756. The topbar shows the honest
  // signal we DO have: whether the incoming handoff notes are acknowledged.
  const { data: shiftNotes } = useShiftNotes();

  // Load detail + conversation sheets are owned here; nested surfaces (wire
  // items, active-load rows) open them through the interaction context.
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [conversationDriverId, setConversationDriverId] = useState<string | null>(null);
  const { data: selectedLoad } = useLoadById(selectedLoadId ?? '');

  // Which spine view is showing — the `L` hotkey flips it.
  const [spineView, setSpineView] = useState<SpineView>('drivers');
  const toggleSpineView = useCallback(() => setSpineView((v) => (v === 'drivers' ? 'loads' : 'drivers')), []);

  // Canvas filters — lifted into the control row so the whole strip is one row
  // above the panes. Risk is the single triage filter and scopes BOTH the spine
  // list and the map; search is shared across views (contextual placeholder).
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [spineSearch, setSpineSearch] = useState('');

  // Overlay state — the unified hotkey runtime drives this.
  const [hotkeysSheetOpen, setHotkeysSheetOpen] = useState(false);
  const openHotkeysSheet = useCallback(() => setHotkeysSheetOpen(true), []);
  const closeHotkeysSheet = useCallback(() => setHotkeysSheetOpen(false), []);

  // Responsive layout + unified hotkeys.
  const paneRouter = usePaneRouter();
  // ≥1100px column sizing + visibility model (resizable / hideable columns).
  const towerLayout = useTowerLayout();
  useTowerHotkeys({
    toggleSpineView,
    openHotkeysSheet,
    closeHotkeysSheet,
    isHotkeysSheetOpen: hotkeysSheetOpen,
    paneRouter,
  });

  const interaction = useMemo(
    () => ({
      openLoad: (loadId: string) => setSelectedLoadId(loadId),
      openConversation: (driverId: string) => setConversationDriverId(driverId),
    }),
    [],
  );

  // The IDE-style panel toggles only apply in 3-column layout (≥1100px).
  const showPanelToggles = paneRouter.layout === 'wide' || paneRouter.layout === 'tight';

  // Page-chrome opt-out: Tower is a full-canvas workspace that escapes the shell
  // padding (-m-4 md:-m-8) and renders its own TowerTopbar + hotkeys. The
  // canonical PageHeader/PageToolbar pattern does not apply, but the canvas
  // controls (view toggle · risk filter · search · lookahead) collapse into a
  // single control row below the topbar, above all three panes. The risk filter
  // is the one triage filter and scopes BOTH the spine list and the map.
  // See sally-frontend-patterns §15.4 (Page Chrome → canvas opt-out).
  return (
    <TowerInteractionProvider value={interaction}>
      <div className="-m-4 md:-m-8 flex h-[calc(100dvh-3.5rem)] flex-col bg-background">
        <TowerTopbar
          handoffAcknowledged={shiftNotes?.handoffStatus?.acknowledged ?? false}
          handoffAcknowledgedAt={shiftNotes?.handoffStatus?.acknowledgedAt ?? null}
          layout={towerLayout}
          showPanelToggles={showPanelToggles}
          onOpenHotkeys={openHotkeysSheet}
        />

        {/* Canvas-wide controls — hidden on the sub-900px handoff screen, which shows no panes. */}
        {paneRouter.layout !== 'unsupported' && (
          <TowerControlRow
            view={spineView}
            onViewChange={setSpineView}
            lookaheadHours={lookaheadHours}
            onLookaheadChange={setLookaheadHours}
            riskFilter={riskFilter}
            onRiskFilterChange={setRiskFilter}
            search={spineSearch}
            onSearchChange={setSpineSearch}
          />
        )}

        <PaneRouter
          router={paneRouter}
          layout={towerLayout}
          spine={
            <TowerSpine lookaheadHours={lookaheadHours} view={spineView} riskFilter={riskFilter} search={spineSearch} />
          }
          map={
            <TowerMap
              lookaheadHours={lookaheadHours}
              riskScores={riskScores ?? []}
              riskFilter={riskFilter}
              onClearRiskFilter={() => setRiskFilter('all')}
              onOpenLoad={(loadId) => setSelectedLoadId(loadId)}
              panelsKey={[
                towerLayout.spineVisible,
                towerLayout.wireVisible,
                towerLayout.spineCollapsed,
                towerLayout.wireCollapsed,
              ].join(':')}
            />
          }
          wire={<Wire />}
        />

        {/* Assertive announcer for critical wire alerts — singleton, no focus move. */}
        <WireAriaLive />

        <HotkeysSheet open={hotkeysSheetOpen} onOpenChange={setHotkeysSheetOpen} />

        <ConversationSheet
          open={!!conversationDriverId}
          onOpenChange={(open) => {
            if (!open) setConversationDriverId(null);
          }}
          driverId={conversationDriverId}
          lookaheadHours={lookaheadHours}
        />

        <Sheet
          open={!!selectedLoadId}
          onOpenChange={(open) => {
            if (!open) setSelectedLoadId(null);
          }}
        >
          <SheetContent className="w-full p-0 flex flex-col" pinnable resizable>
            {selectedLoad && (
              <LoadDetailPanel
                load={selectedLoad}
                onStatusChange={(id, status) => router.push(`/dispatcher/loads/${id}?status=${status}`)}
                onDuplicate={(id) => router.push(`/dispatcher/loads?duplicate=${id}`)}
                onCopyTrackingLink={(id) => {
                  if (typeof window !== 'undefined') {
                    void navigator.clipboard.writeText(`${window.location.origin}/tracking/${id}`);
                  }
                }}
              />
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TowerInteractionProvider>
  );
}
