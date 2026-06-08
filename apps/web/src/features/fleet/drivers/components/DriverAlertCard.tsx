'use client';

import { Bot, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';

import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import { useAcknowledgeAlert } from '@/features/operations/alerts/hooks/use-alerts';
import type { Alert } from '@/features/operations/alerts';
import { AlertPriority } from '@/features/operations/alerts';

interface DriverAlertCardProps {
  alert: Alert;
}

const priorityStyles: Record<AlertPriority, string> = {
  [AlertPriority.CRITICAL]: 'border-critical/50 shadow-critical/10 shadow-sm',
  [AlertPriority.HIGH]: 'border-caution/50',
  [AlertPriority.MEDIUM]: 'border-caution/50',
  [AlertPriority.LOW]: 'border-info/50',
};

const priorityBadgeVariant: Record<AlertPriority, string> = {
  [AlertPriority.CRITICAL]: 'bg-critical/10 text-critical',
  [AlertPriority.HIGH]: 'bg-caution/10 text-caution',
  [AlertPriority.MEDIUM]: 'bg-caution/10 text-caution',
  [AlertPriority.LOW]: 'bg-info/10 text-info',
};

export function DriverAlertCard({ alert }: DriverAlertCardProps) {
  const acknowledgeMutation = useAcknowledgeAlert();
  const isAcknowledged = alert.status === 'ACKNOWLEDGED' || alert.status === 'RESOLVED';

  return (
    <Card className={cn('transition-opacity', isAcknowledged ? 'opacity-60' : priorityStyles[alert.priority])}>
      <CardContent className="p-4 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-foreground">
              {isAcknowledged && <CheckCircle className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />}
              {alert.title}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span
            className={cn(
              'text-2xs font-medium px-2 py-0.5 rounded-full capitalize',
              priorityBadgeVariant[alert.priority],
            )}
          >
            {alert.priority.toLowerCase()}
          </span>
        </div>

        {/* Message */}
        <p className="text-sm text-muted-foreground">{alert.message}</p>

        {/* Sally says */}
        {alert.recommendedAction && (
          <div className="flex items-start gap-2 bg-muted rounded-lg p-2">
            <Bot className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground italic">Sally says: {alert.recommendedAction}</p>
          </div>
        )}

        {/* Action */}
        {!isAcknowledged && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            loading={acknowledgeMutation.isPending}
            onClick={() => acknowledgeMutation.mutate(alert.alertId)}
          >
            Acknowledge
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
