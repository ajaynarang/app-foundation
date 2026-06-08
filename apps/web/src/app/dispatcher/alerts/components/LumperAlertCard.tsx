'use client';

import { useState } from 'react';
import { DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { SallyInsightsCard } from './SallyInsightsCard';
import { MoneyCodeEntry } from './MoneyCodeEntry';
import { useResolveAlert } from '@/features/operations/alerts';
import type { Alert } from '@/features/operations/alerts';

interface LumperAlertCardProps {
  alert: Alert;
}

export function LumperAlertCard({ alert }: LumperAlertCardProps) {
  const [expanded, setExpanded] = useState(false);
  const resolveMutation = useResolveAlert();

  const metadata = (alert.metadata ?? {}) as Record<string, unknown>;
  const requestedCents = (metadata.requestedCents as number) ?? 0;
  const method = (metadata.method as string) ?? 'comchek';
  const moneyCodeId = (metadata.moneyCodeId as string) ?? '';
  const loadId = alert.loadId ?? '';
  const driverName = (metadata.driverName as string) ?? 'Driver';

  const handleComplete = () => {
    resolveMutation.mutate({ alertId: alert.alertId });
  };

  return (
    <div className="bg-muted/50 rounded-md overflow-hidden">
      {/* Compact view — always visible */}
      <div className="p-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-green-400/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-3.5 w-3.5 text-green-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
              <p className="text-xs text-muted-foreground">
                {driverName} · {method.toUpperCase()} · ${(requestedCents / 100).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="caution" className="text-xs capitalize">
              {alert.priority.toLowerCase()}
            </Badge>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setExpanded(!expanded)}>
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Review
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="border-t border-border/50 p-3 space-y-3">
          {/* Alert message */}
          {alert.message && <p className="text-xs text-muted-foreground">{alert.message}</p>}

          {/* Sally insights */}
          {loadId && <SallyInsightsCard loadId={loadId} requestedCents={requestedCents} />}

          {/* Money code entry */}
          {moneyCodeId && loadId && (
            <MoneyCodeEntry
              loadId={loadId}
              moneyCodeId={moneyCodeId}
              requestedCents={requestedCents}
              method={method}
              onComplete={handleComplete}
            />
          )}
        </div>
      )}
    </div>
  );
}
