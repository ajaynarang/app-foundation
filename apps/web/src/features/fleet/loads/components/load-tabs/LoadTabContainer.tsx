'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Badge } from '@sally/ui/components/ui/badge';
import { LoadSummaryBar } from '../LoadSummaryBar';
import { LoadDetailMonitoring } from './shared/LoadDetailMonitoring';
import { OverviewTab } from './OverviewTab';
import { RouteTab } from './RouteTab';
import { FinancialsTab } from './FinancialsTab';
import { DocsTab } from './DocsTab';
import { ActivityTab } from './ActivityTab';
import { useLoadCharges } from '@/features/fleet/loads/hooks/use-loads';
import { useDocuments } from '@/features/fleet/documents';
import type { Load } from '@/features/fleet/loads/types';
import type { BillingReadinessResult } from '@/features/financials/close-out/types';

const TAB_TRIGGER_CLASS =
  'rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 py-2.5 text-xs';

const MONITORED_STATUSES = new Set(['ASSIGNED', 'IN_TRANSIT']);

interface LoadTabContainerProps {
  load: Load;
  billingReadiness?: BillingReadinessResult | null;
  onDuplicate: () => void;
  /** Rendered inside the Overview tab when in draft/edit mode */
  editFormContent?: ReactNode;
  /** Rendered inside the Route tab when in draft/edit mode */
  editRouteContent?: ReactNode;
  isDraft?: boolean;
  isEditing?: boolean;
  /** When true, hides all edit/action buttons within tabs */
  readOnly?: boolean;
  /** Tab to open initially. Used by deep-links (e.g. ?tab=docs from the
   *  factor-bundle dialog). Falls back to 'overview' if not a known tab. */
  defaultTab?: string;
}

const VALID_TABS = new Set(['overview', 'route', 'financials', 'docs', 'activity']);

export function LoadTabContainer({
  load,
  billingReadiness,
  onDuplicate,
  editFormContent,
  editRouteContent,
  isDraft,
  isEditing,
  readOnly,
  defaultTab,
}: LoadTabContainerProps) {
  const initialTab = defaultTab && VALID_TABS.has(defaultTab) ? defaultTab : 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { data: charges } = useLoadCharges(load.loadNumber);
  const { data: documents } = useDocuments('load', load.id);

  const revenueCents = useMemo(
    () => (charges ?? []).filter((c) => c.isBillable).reduce((sum, c) => sum + c.totalCents, 0),
    [charges],
  );

  const costCents = useMemo(
    () => (charges ?? []).filter((c) => c.isPayable).reduce((sum, c) => sum + c.totalCents, 0),
    [charges],
  );

  const hasCosts = (charges ?? []).some((c) => c.isPayable);
  const effectiveRevenue = revenueCents || (load.rateCents ?? 0);
  const docCount = (documents ?? []).length;

  // For delivered loads, derive doc readiness from billing readiness (single source of truth)
  // For other statuses, just show uploaded count
  const isDelivered = load.status === 'DELIVERED';
  const docsComplete = isDelivered && billingReadiness ? billingReadiness.totalSatisfied : docCount;
  const docsTotal = isDelivered && billingReadiness ? billingReadiness.totalRequired : docCount;

  const showMonitoring = MONITORED_STATUSES.has(load.status) && !isDraft && !isEditing;

  return (
    <div className="flex flex-col h-full">
      {/* ── Persistent above-tab sections ── */}

      {/* Summary bar (non-draft only) */}
      {!isDraft && (
        <LoadSummaryBar
          revenueCents={effectiveRevenue}
          costCents={costCents}
          docsComplete={docsComplete}
          docsTotal={docsTotal}
          hasCharges={(charges ?? []).length > 0}
          hasCosts={hasCosts}
        />
      )}

      {/* Monitoring — front-and-center for active loads */}
      {showMonitoring && (
        <div className="px-4 pt-2 pb-2">
          <LoadDetailMonitoring
            loadId={load.loadNumber}
            loadNumber={load.loadNumber}
            hasSmartRoute={!!load.routePlan}
            routePlanId={load.routePlan?.planId}
          />
        </div>
      )}

      {/* ── Tab strip + content ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0">
          <TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>
            Overview
          </TabsTrigger>
          <TabsTrigger value="route" className={TAB_TRIGGER_CLASS}>
            Route
          </TabsTrigger>
          {!isDraft && (
            <TabsTrigger value="financials" className={TAB_TRIGGER_CLASS}>
              Financials
            </TabsTrigger>
          )}
          <TabsTrigger value="docs" className={TAB_TRIGGER_CLASS + ' flex items-center gap-1.5'}>
            Docs
            {docCount > 0 && (
              <Badge variant="muted" className="h-4 min-w-4 px-1 text-[9px]">
                {docCount}
              </Badge>
            )}
          </TabsTrigger>
          {!isDraft && (
            <TabsTrigger value="activity" className={TAB_TRIGGER_CLASS}>
              Activity
            </TabsTrigger>
          )}
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="overview" className="mt-0 p-4">
            {editFormContent ?? (
              <OverviewTab
                load={load}
                billingReadiness={billingReadiness}
                onDuplicate={onDuplicate}
                onGoToFinancials={() => setActiveTab('financials')}
              />
            )}
          </TabsContent>
          <TabsContent value="route" className="mt-0 p-4">
            {editRouteContent ?? <RouteTab load={load} />}
          </TabsContent>
          {!isDraft && (
            <TabsContent value="financials" className="mt-0 p-4">
              <FinancialsTab load={load} readOnly={readOnly} />
            </TabsContent>
          )}
          <TabsContent value="docs" className="mt-0 p-4">
            <DocsTab load={load} />
          </TabsContent>
          {!isDraft && (
            <TabsContent value="activity" className="mt-0 p-4">
              <ActivityTab load={load} />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
