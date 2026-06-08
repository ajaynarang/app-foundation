'use client';

import { Badge } from '@app/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { MockAlert } from '../../engine/types';

const severityStyles: Record<string, string> = {
  critical: `${SEMANTIC_COLORS.critical.bg} ${SEMANTIC_COLORS.critical.text}`,
  warning: `${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.text}`,
  info: `${SEMANTIC_COLORS.info.bg} ${SEMANTIC_COLORS.info.text}`,
};

export function AlertCard({ data }: { data: Record<string, unknown> }) {
  // Single alert
  if (data.id) {
    const alert = data as unknown as MockAlert & { acknowledged?: boolean };
    return (
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Badge className={severityStyles[alert.severity]}>{alert.severity}</Badge>
          <span className="text-xs text-muted-foreground">{alert.id}</span>
        </div>
        <p className="text-sm text-foreground">{alert.message}</p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          {alert.driver && <span>Driver: {alert.driver}</span>}
          <span>Route: {alert.route}</span>
        </div>
        {alert.acknowledged && (
          <Badge variant="outline" className="text-muted-foreground border-border">
            Acknowledged
          </Badge>
        )}
      </div>
    );
  }

  // Alert list
  const alerts = (data.alerts ?? []) as MockAlert[];
  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div key={alert.id} className="rounded-lg border border-border bg-card p-2 flex items-center gap-3">
          <Badge className={`${severityStyles[alert.severity]} text-2xs px-1.5 py-0.5`}>
            {alert.severity === 'critical' ? '!!!' : alert.severity === 'warning' ? '!!' : 'i'}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground truncate">{alert.message}</p>
            <p className="text-2xs text-muted-foreground">
              {alert.id} {alert.driver ? `\u00B7 ${alert.driver}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
