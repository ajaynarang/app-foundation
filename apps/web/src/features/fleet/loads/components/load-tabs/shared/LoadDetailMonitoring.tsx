'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Radio, MapPin } from 'lucide-react';
import { cn } from '@sally/ui';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAlerts } from '@/features/operations/alerts/hooks/use-alerts';
import type { Alert } from '@/features/operations/alerts/types';
import { AlertPriority } from '@/features/operations/alerts';
import { useSystemHealth } from '@/features/operations/tower/hooks/use-command-center';
import type { SystemHealthCheck } from '@/features/operations/tower/types';
import { LoadTrackingDialog } from './LoadTrackingDialog';

type CheckStatus = 'ok' | 'warning' | 'critical' | 'inactive';

const CHECK_DOT: Record<CheckStatus, string> = {
  ok: 'bg-muted-foreground/40',
  warning: 'bg-caution',
  critical: 'bg-critical',
  inactive: 'bg-muted-foreground/20',
};

const CHECK_TEXT: Record<CheckStatus, string> = {
  ok: 'text-muted-foreground',
  warning: 'text-foreground',
  critical: 'text-foreground',
  inactive: 'text-muted-foreground/40',
};

const ALERT_SEVERITY: Record<string, CheckStatus> = {
  critical: 'critical',
  high: 'critical',
  medium: 'warning',
  low: 'ok',
};

const PLAN_CHECK_PREFIX = 'PLAN_';

export function LoadDetailMonitoring({
  loadId,
  loadNumber,
  hasSmartRoute,
  routePlanId,
}: {
  loadId: string;
  loadNumber: string;
  hasSmartRoute: boolean;
  routePlanId?: string | null;
}) {
  const { data: health } = useSystemHealth();
  const { data: alerts = [], isLoading } = useAlerts({
    loadId,
    status: 'ACTIVE',
  });
  const [expanded, setExpanded] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);

  const alertByType = useMemo(() => {
    const map: Record<string, Alert> = {};
    for (const a of alerts) {
      if (!map[a.alertType]) map[a.alertType] = a;
    }
    return map;
  }, [alerts]);

  const checks = health?.checks;
  if (!checks && !isLoading) return null;

  const resolveStatus = (check: SystemHealthCheck): CheckStatus => {
    if (!check.enabled) return 'inactive';
    if (check.type.startsWith(PLAN_CHECK_PREFIX) && !hasSmartRoute) return 'inactive';
    const fired = alertByType[check.type];
    if (fired) return ALERT_SEVERITY[fired.priority] ?? 'warning';
    return 'ok';
  };

  const allChecks = checks?.flatMap((c) => c.checks) ?? [];
  const totalActive = allChecks.filter((c) => resolveStatus(c) !== 'inactive').length;
  const passingCount = allChecks.filter((c) => resolveStatus(c) === 'ok').length;
  const issueCount = alerts.length;
  const hasIssues = issueCount > 0;

  const worstSeverity: CheckStatus =
    alerts.length > 0
      ? alerts.some((a) => a.priority === 'CRITICAL' || a.priority === 'HIGH')
        ? 'critical'
        : 'warning'
      : 'ok';

  if (isLoading) {
    return <Skeleton className="h-10 w-full rounded-lg" />;
  }

  return (
    <>
      <div
        className={cn(
          'rounded-lg border border-border bg-card overflow-hidden',
          worstSeverity === 'critical' && 'border-l-2 border-l-critical',
          worstSeverity === 'warning' && 'border-l-2 border-l-caution',
        )}
      >
        {/* Single-row header — always visible.
            Rendered as a role="button" div (not a <button>) because it nests
            interactive controls (the Track button + Alerts link); a <button>
            cannot contain another button/anchor without invalid HTML +
            hydration errors. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(!expanded);
            }
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Radio className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground">Monitoring</span>

          {hasIssues ? (
            <Badge variant="outline" className="text-2xs h-4 px-1.5 bg-critical/10 text-critical border-critical/20">
              {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
            </Badge>
          ) : (
            <span className="text-2xs text-muted-foreground">
              {passingCount}/{totalActive} OK
            </span>
          )}

          {/* Right-side actions + chevron */}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-2xs px-1.5"
              onClick={(e) => {
                e.stopPropagation();
                setTrackingOpen(true);
              }}
            >
              <MapPin className="h-3 w-3 mr-0.5" />
              Track
            </Button>
            <Link
              href="/dispatcher/alerts"
              className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Alerts →
            </Link>
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Expanded: alerts always visible, checks nested collapsible */}
        {expanded && (
          <div className="border-t border-border">
            {/* Fired alerts — always shown when expanded */}
            {hasIssues && (
              <div className="px-3 py-2 space-y-1">
                {alerts.map((alert: Alert) => (
                  <div key={alert.alertId} className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        CHECK_DOT[ALERT_SEVERITY[alert.priority] ?? 'warning'],
                      )}
                    />
                    <span className="text-foreground truncate flex-1">{alert.title}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-2xs shrink-0 h-4 px-1.5',
                        alert.priority === 'CRITICAL' || alert.priority === 'HIGH'
                          ? 'bg-critical/10 text-critical border-critical/20'
                          : 'bg-caution/10 text-caution border-caution/20',
                      )}
                    >
                      {alert.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* All checks — nested collapsible, collapsed by default */}
            {checks && (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowChecks(!showChecks)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-2xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                >
                  <span>All checks ({totalActive} active)</span>
                  {showChecks ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                {showChecks && (
                  <div className="px-3 pb-2 space-y-2">
                    {checks.map((cat) => (
                      <div key={cat.category}>
                        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                          {cat.category}
                        </span>
                        <div className="mt-0.5 space-y-px">
                          {cat.checks.map((check: SystemHealthCheck) => {
                            const status = resolveStatus(check);
                            const fired = alertByType[check.type];
                            return (
                              <div key={check.type} className="flex items-center justify-between text-xs py-px">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', CHECK_DOT[status])} />
                                  <span className={CHECK_TEXT[status]}>{check.name}</span>
                                </div>
                                <span className="text-2xs text-muted-foreground/50">
                                  {status === 'inactive' && (!check.enabled ? 'N/A' : 'No plan')}
                                  {status === 'ok' && 'OK'}
                                  {status === 'warning' && fired?.priority}
                                  {status === 'critical' && fired?.priority}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <LoadTrackingDialog
        open={trackingOpen}
        onOpenChange={setTrackingOpen}
        loadId={loadId}
        loadNumber={loadNumber}
        routePlanId={routePlanId}
      />
    </>
  );
}
