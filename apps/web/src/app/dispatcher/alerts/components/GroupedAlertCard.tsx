'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sally/ui/components/ui/collapsible';
import { useAcknowledgeAlert, useResolveAlert, AlertPriority } from '@/features/operations/alerts';
import type { GroupedAlert, Alert } from '@/features/operations/alerts';
import { LumperAlertCard } from './LumperAlertCard';
import { ALERT_QUICK_ACTIONS } from '@/features/operations/alerts/config/quick-actions';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';

const PRIORITY_BORDER: Record<AlertPriority, string> = {
  [AlertPriority.CRITICAL]: SEMANTIC_COLORS.critical.borderL,
  [AlertPriority.HIGH]: SEMANTIC_COLORS.caution.borderL,
  [AlertPriority.MEDIUM]: SEMANTIC_COLORS.neutral.borderL,
  [AlertPriority.LOW]: SEMANTIC_COLORS.neutral.borderL,
};

const PRIORITY_BADGE: Record<AlertPriority, 'critical' | 'caution' | 'outline' | 'muted' | 'default'> = {
  [AlertPriority.CRITICAL]: 'critical',
  [AlertPriority.HIGH]: 'caution',
  [AlertPriority.MEDIUM]: 'muted',
  [AlertPriority.LOW]: 'default',
};

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

interface GroupedAlertCardProps {
  group: GroupedAlert;
}

export function GroupedAlertCard({ group }: GroupedAlertCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const acknowledgeMutation = useAcknowledgeAlert();
  const resolveMutation = useResolveAlert();

  const topAlert = group.latestAlert;
  const remainingAlerts = group.alerts.slice(1);
  const borderClass = PRIORITY_BORDER[group.priority];

  // Count by priority for header badges
  const priorityCounts = group.alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.priority] = (acc[a.priority] || 0) + 1;
    return acc;
  }, {});

  return (
    <Card className={`border-l-4 ${borderClass}`}>
      <CardContent className="p-4 md:p-5">
        {/* Header: entity info + priority badges */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground shrink-0">
              {(group.driverName ?? group.entityId).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-foreground truncate">
                {group.scope === 'driver' ? (
                  group.driverName || group.driverId
                ) : (
                  <>
                    {group.loadNumber || group.loadId || group.entityId}
                    {group.referenceNumber && (
                      <span className="text-muted-foreground font-normal ml-1 text-sm">
                        · Ref: {group.referenceNumber}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {group.scope === 'driver' && group.driverName && (
                  <span className="text-muted-foreground/70">{group.driverId} · </span>
                )}
                {group.alertCount} alert{group.alertCount !== 1 ? 's' : ''} · {group.scope}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(priorityCounts).map(([p, count]) => (
              <Badge key={p} variant={PRIORITY_BADGE[p as AlertPriority] || 'outline'} className="text-xs">
                {count} {p}
              </Badge>
            ))}
          </div>
        </div>

        {/* Top alert (always visible) */}
        {topAlert.alertType === 'LUMPER_REQUEST' ? (
          <LumperAlertCard alert={topAlert} />
        ) : (
          <AlertRow
            alert={topAlert}
            onAcknowledge={() => acknowledgeMutation.mutate(topAlert.alertId)}
            onResolve={() => resolveMutation.mutate({ alertId: topAlert.alertId })}
            isAcknowledging={acknowledgeMutation.isPending}
            isResolving={resolveMutation.isPending}
          />
        )}

        {/* Expandable remaining alerts */}
        {remainingAlerts.length > 0 && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {isOpen ? 'Hide' : `+ ${remainingAlerts.length} more alert${remainingAlerts.length !== 1 ? 's' : ''}`}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {remainingAlerts.map((alert) =>
                alert.alertType === 'LUMPER_REQUEST' ? (
                  <LumperAlertCard key={alert.alertId} alert={alert} />
                ) : (
                  <AlertRow
                    key={alert.alertId}
                    alert={alert}
                    onAcknowledge={() => acknowledgeMutation.mutate(alert.alertId)}
                    onResolve={() => resolveMutation.mutate({ alertId: alert.alertId })}
                    isAcknowledging={acknowledgeMutation.isPending}
                    isResolving={resolveMutation.isPending}
                  />
                ),
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRow({
  alert,
  onAcknowledge,
  onResolve,
  isAcknowledging,
  isResolving,
}: {
  alert: Alert;
  onAcknowledge: () => void;
  onResolve: () => void;
  isAcknowledging: boolean;
  isResolving: boolean;
}) {
  const quickActions = ALERT_QUICK_ACTIONS[alert.alertType] || [];
  const isActive = alert.status === 'ACTIVE';

  return (
    <div className="bg-muted/50 rounded-md p-3 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Badge variant={PRIORITY_BADGE[alert.priority]} className="text-xs">
            {alert.priority}
          </Badge>
          <span className="text-sm text-foreground font-medium truncate">{alert.title}</span>
          {(alert.occurrenceCount ?? 1) > 1 && (
            <span className={`inline-flex items-center gap-1 text-xs ${SEMANTIC_COLORS.caution.text}`}>
              <AlertTriangle className="h-3 w-3" />
              {alert.occurrenceCount}x
            </span>
          )}
          <span className="text-xs text-muted-foreground">{formatRelativeTime(alert.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href(alert)}
              className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-2 hover:bg-muted hover:text-foreground transition-colors"
            >
              <action.icon className="h-3 w-3 mr-1" />
              {action.label}
            </Link>
          ))}
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onAcknowledge}
              loading={isAcknowledging}
            >
              Ack
            </Button>
          )}
          <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={onResolve} loading={isResolving}>
            Resolve
          </Button>
        </div>
      </div>
      {alert.message && <p className="text-xs text-muted-foreground line-clamp-1">{alert.message}</p>}
    </div>
  );
}
