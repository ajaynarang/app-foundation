'use client';

import { useState } from 'react';
import { ShieldCheck, RefreshCw, XCircle, Loader2, ExternalLink, ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { PageHeader, PageToolbar } from '@/shared/components/page-chrome';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { showSuccess, showSuccessWithLink, showError } from '@sally/ui';
import {
  useShieldLatest,
  useTriggerAudit,
  useCancelAudit,
  useResolveFinding,
  useBulkResolveFindings,
} from '@/features/operations/shield';
import type {
  ShieldFindingCategory,
  ShieldFindingSource,
  ShieldFindingSeverity,
  ShieldAuditScope,
} from '@/features/operations/shield';
import { ScoreHero } from '@/features/operations/shield/components/ScoreHero';
import { ShieldAuditActions } from '@/features/operations/shield/components/shield-audit-actions';
import { CustomRulesSheet } from '@/features/operations/shield/components/custom-rules-sheet';
import { CategoryScoreCard } from '@/features/operations/shield/components/CategoryScoreCard';
import { AIInsightsCard } from '@/features/operations/shield/components/AIInsightsCard';
import { FindingsList } from '@/features/operations/shield/components/FindingsList';
import { BulkResolveBar } from '@/features/operations/shield/components/BulkResolveBar';

// ── Small inline components ──────────────────────────────────────────────

const CATEGORY_FILTERS: { key: ShieldFindingCategory | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'HOS', label: 'HOS' },
  { key: 'DRIVERS', label: 'Drivers' },
  { key: 'VEHICLES', label: 'Vehicles' },
  { key: 'LOADS', label: 'Loads' },
];

const SOURCE_FILTERS: { key: ShieldFindingSource | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'RULE', label: 'Rules' },
  { key: 'AI', label: 'Sally AI' },
  { key: 'CUSTOM', label: 'Custom' },
];

const SEVERITY_FILTERS: { key: ShieldFindingSeverity | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'WARNING', label: 'Warning' },
  { key: 'INFO', label: 'Info' },
];

function AuditInProgressBanner() {
  const { data } = useShieldLatest();
  const cancelAudit = useCancelAudit();
  const inProgressId = data?.inProgressAudit?.id;

  return (
    <Card className={`${SEMANTIC_COLORS.caution.border} ${SEMANTIC_COLORS.caution.bg}`}>
      <CardContent className="p-3 md:p-4 flex items-center gap-3">
        <Loader2 className={`h-5 w-5 animate-spin ${SEMANTIC_COLORS.caution.text} shrink-0`} />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Audit in progress...</p>
          <p className="text-xs text-muted-foreground">
            Checking compliance across all categories. Results will appear shortly.
          </p>
        </div>
        {inProgressId && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            loading={cancelAudit.isPending}
            onClick={() => cancelAudit.mutate(inProgressId)}
          >
            Cancel
          </Button>
        )}
        <Link
          href="/settings/system-activity?category=compliance"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 shrink-0"
        >
          System Activity
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 md:h-40 w-full rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 md:h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 md:h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onRunAudit }: { onRunAudit: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 md:py-20 px-4">
      <ShieldCheck className="h-16 w-16 md:h-20 md:w-20 text-muted-foreground mb-4" />
      <h2 className="text-lg md:text-xl font-semibold text-foreground mb-2">No audits yet</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        Run your first Shield audit to see how your fleet measures up against DOT compliance standards across HOS,
        drivers, vehicles, and loads.
      </p>
      <Button onClick={onRunAudit}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Run First Audit
      </Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

function ShieldDashboard() {
  const { data, isLoading, error } = useShieldLatest();
  const triggerAudit = useTriggerAudit();
  const resolveFinding = useResolveFinding();
  const bulkResolve = useBulkResolveFindings();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeAi, setIncludeAi] = useState(true);
  const [includeCustomRules, setIncludeCustomRules] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<ShieldFindingCategory | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<ShieldFindingSource | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<ShieldFindingSeverity | 'ALL'>('ALL');
  const [auditPeriodDays, setAuditPeriodDays] = useState(30);
  const [rulesOpen, setRulesOpen] = useState(false);
  const router = useRouter();

  const handleRunAudit = (scope: ShieldAuditScope) => {
    triggerAudit.mutate(
      { scope, includeAi, includeCustomRules, auditPeriodDays },
      {
        onSuccess: (result) => {
          if (result.queued) {
            showSuccessWithLink(
              `Shield ${scope === 'FULL' ? 'full' : scope.toLowerCase()} audit is running`,
              'System Activity',
              '/settings/system-activity?category=compliance',
            );
          } else {
            showSuccessWithLink(
              result.message || 'Please wait for the current audit to complete.',
              'System Activity',
              '/settings/system-activity?category=compliance',
            );
          }
        },
        onError: () => {
          showError('Audit failed to start', 'Something went wrong. Please try again.');
        },
      },
    );
  };

  const handleResolve = (findingId: string) => {
    setResolvingId(findingId);
    resolveFinding.mutate(findingId, {
      onSuccess: () => {
        showSuccess('Finding resolved');
        setResolvingId(null);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(findingId);
          return next;
        });
      },
      onError: () => {
        showError('Failed to resolve');
        setResolvingId(null);
      },
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkResolve = () => {
    const ids = Array.from(selectedIds);
    bulkResolve.mutate(ids, {
      onSuccess: (result) => {
        showSuccess(`${result.resolved} findings resolved`);
        setSelectedIds(new Set());
      },
      onError: () => {
        showError('Failed to resolve findings');
      },
    });
  };

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Failed to load Shield data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAuditRunning = triggerAudit.isPending || !!data?.inProgress;

  if (!data?.hasAudit && !data?.inProgress && !data?.hasFailed) {
    return (
      <div>
        <EmptyState onRunAudit={() => handleRunAudit('FULL')} />
      </div>
    );
  }

  if (!data?.hasAudit && data?.hasFailed && !data?.inProgress) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-12 md:py-20 px-4">
          <XCircle className={`h-16 w-16 md:h-20 md:w-20 ${SEMANTIC_COLORS.critical.text} mb-4`} />
          <h2 className="text-lg md:text-xl font-semibold text-foreground mb-2">Audit failed</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Something went wrong while running the audit. Please try again.
          </p>
          <Button onClick={() => handleRunAudit('FULL')} loading={isAuditRunning}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {isAuditRunning ? 'Audit Running...' : 'Retry Audit'}
          </Button>
        </div>
      </div>
    );
  }

  if (!data?.hasAudit && data?.inProgress) {
    return (
      <div className="space-y-6">
        <AuditInProgressBanner />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {(['HOS', 'Drivers', 'Vehicles', 'Loads'] as const).map((label) => (
            <Card key={label}>
              <CardContent className="p-3 md:p-4">
                <span className="text-xs md:text-sm font-medium text-muted-foreground">{label}</span>
                <div className="mt-2">
                  <Skeleton className="h-7 w-16" />
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const audit = data?.audit;
  if (!audit) return <LoadingSkeleton />;
  const findings = audit.findings ?? [];

  const auditCoverage = audit.coverage as
    | Record<string, { check: string; regulation: string; source: 'rule' | 'ai' }[]>
    | null
    | undefined;

  const categories: {
    key: ShieldFindingCategory;
    label: string;
    score: number | null;
    scope: ShieldAuditScope;
  }[] = [
    { key: 'HOS', label: 'HOS', score: audit.hosScore, scope: 'HOS' },
    { key: 'DRIVERS', label: 'Drivers', score: audit.driversScore, scope: 'DRIVERS' },
    { key: 'VEHICLES', label: 'Vehicles', score: audit.vehiclesScore, scope: 'VEHICLES' },
    { key: 'LOADS', label: 'Loads', score: audit.loadsScore, scope: 'LOADS' },
  ];

  return (
    <div className="space-y-6">
      {isAuditRunning && <AuditInProgressBanner />}

      {/* Score history + past audits moved to /dispatcher/insights/compliance-trend
          as part of the workspace ↔ insights split (Phase B). Shield shows
          today's posture; trend over time is a report (linked from the page header). */}
      <div className="space-y-4 md:space-y-6">
        {/* Zone 2 — Toolbar: audit actions (no nav tabs, no view switcher) */}
        <PageToolbar
          primaryAction={
            <ShieldAuditActions
              auditId={audit.id}
              onRunAudit={handleRunAudit}
              isAuditRunning={isAuditRunning}
              includeAi={includeAi}
              setIncludeAi={setIncludeAi}
              includeCustomRules={includeCustomRules}
              setIncludeCustomRules={setIncludeCustomRules}
              auditPeriodDays={auditPeriodDays}
              setAuditPeriodDays={setAuditPeriodDays}
            />
          }
          moreActions={[
            { label: 'Custom rules', icon: ListChecks, onClick: () => setRulesOpen(true) },
            {
              label: 'View compliance trend',
              icon: ExternalLink,
              onClick: () => router.push('/dispatcher/insights/compliance-trend'),
            },
          ]}
        />

        {/* KPI row — score hero (display-only) */}
        <ScoreHero audit={audit} nextScheduledAt={data?.nextScheduledAt} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {categories.map((cat) => (
            <CategoryScoreCard
              key={cat.key}
              label={cat.label}
              score={cat.score}
              onAudit={() => handleRunAudit(cat.scope)}
              isAuditRunning={isAuditRunning}
              coverage={auditCoverage?.[cat.key]}
            />
          ))}
        </div>

        <AIInsightsCard audit={audit} />

        {(() => {
          // Compute filtered count for the summary line
          let filteredFindings = findings;
          if (categoryFilter !== 'ALL')
            filteredFindings = filteredFindings.filter((f) => f.category === categoryFilter);
          if (sourceFilter !== 'ALL') filteredFindings = filteredFindings.filter((f) => f.source === sourceFilter);
          if (severityFilter !== 'ALL')
            filteredFindings = filteredFindings.filter((f) => f.severity === severityFilter);
          const isFiltered = categoryFilter !== 'ALL' || sourceFilter !== 'ALL' || severityFilter !== 'ALL';

          return (
            <div className="space-y-3">
              {/* Filter bar — two dropdowns + optional audit button, single line */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={categoryFilter}
                    onValueChange={(v) => setCategoryFilter(v as ShieldFindingCategory | 'ALL')}
                  >
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_FILTERS.map((f) => (
                        <SelectItem key={f.key} value={f.key} className="text-xs">
                          {f.key === 'ALL' ? 'All Categories' : f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as ShieldFindingSource | 'ALL')}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_FILTERS.map((f) => (
                        <SelectItem key={f.key} value={f.key} className="text-xs">
                          {f.key === 'ALL' ? 'All Sources' : f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={severityFilter}
                    onValueChange={(v) => setSeverityFilter(v as ShieldFindingSeverity | 'ALL')}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_FILTERS.map((f) => (
                        <SelectItem key={f.key} value={f.key} className="text-xs">
                          {f.key === 'ALL' ? 'All Severity' : f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isFiltered && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground px-2"
                      onClick={() => {
                        setCategoryFilter('ALL');
                        setSourceFilter('ALL');
                        setSeverityFilter('ALL');
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-3 sm:ml-auto">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {isFiltered
                      ? `${filteredFindings.length} of ${findings.length} findings`
                      : `${findings.length} finding${findings.length !== 1 ? 's' : ''}`}
                  </span>
                  {categoryFilter !== 'ALL' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const cat = categories.find((c) => c.key === categoryFilter);
                        if (cat) handleRunAudit(cat.scope);
                      }}
                      disabled={isAuditRunning}
                    >
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Audit {categories.find((c) => c.key === categoryFilter)?.label} Only
                    </Button>
                  )}
                </div>
              </div>

              <FindingsList
                findings={findings}
                category={categoryFilter === 'ALL' ? undefined : categoryFilter}
                source={sourceFilter === 'ALL' ? undefined : sourceFilter}
                severity={severityFilter === 'ALL' ? undefined : severityFilter}
                onResolve={handleResolve}
                resolvingId={resolvingId}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
              />
            </div>
          );
        })()}
      </div>

      <BulkResolveBar
        count={selectedIds.size}
        onResolve={handleBulkResolve}
        isPending={bulkResolve.isPending}
        onClear={() => setSelectedIds(new Set())}
      />

      <CustomRulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  );
}

export default function ShieldPage() {
  return (
    <FeatureGuard featureKey="shield">
      <div className="space-y-6">
        <PageHeader title="Shield" subtitle="DOT compliance, audited and scored" hasTabs />
        <ShieldDashboard />
      </div>
    </FeatureGuard>
  );
}
