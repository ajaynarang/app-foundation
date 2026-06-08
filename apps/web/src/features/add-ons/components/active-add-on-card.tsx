'use client';

import { Check } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Switch } from '@sally/ui/components/ui/switch';
import { cn } from '@sally/ui';
import { getUsageColor } from '@/features/billing/utils';
import { formatCents } from '@/shared/lib/utils/formatters';
import type { TenantAddOn } from '@sally/shared-types';

function getUsagePercentage(current: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

interface ActiveAddOnCardProps {
  sub: TenantAddOn;
  onToggleOverage?: (slug: string, enabled: boolean) => void;
  onCancel?: React.ReactNode;
}

/**
 * Shared active add-on card used on both the Add-ons page and Subscription page.
 *
 * Displays:
 * - Name + Active/Gifted badge + price + activation date
 * - For metered add-ons: usage bar + overage toggle
 * - For unlimited add-ons: clean card, no usage section
 * - Cancel action (passed as ReactNode for flexibility)
 */
export function ActiveAddOnCard({ sub, onToggleOverage, onCancel }: ActiveAddOnCardProps) {
  const isGifted = sub.source === 'gifted';
  const isMetered = sub.usageLimit !== null && sub.usageLimit > 0;
  const usagePercent = isMetered ? getUsagePercentage(sub.currentUsage, sub.usageLimit) : null;
  const hasOverage = sub.addOn.overageRateCents !== null && sub.addOn.overageRateCents !== undefined;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">{sub.addOn.name}</h3>
              <Badge variant="outline" className="text-2xs">
                <Check className="h-3 w-3 mr-1" />
                {isGifted ? 'Gifted' : 'Active'}
              </Badge>
            </div>

            {/* Price + activation date */}
            <p className="text-sm text-muted-foreground mt-0.5">
              {isGifted ? 'Free' : `${formatCents(sub.addOn.priceCents ?? 0)}/mo`}
              {sub.activatedAt && (
                <span className="ml-2 text-xs">· Since {new Date(sub.activatedAt).toLocaleDateString()}</span>
              )}
            </p>

            {/* Usage meter for metered add-ons */}
            {isMetered && usagePercent !== null && sub.usageLimit !== null && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {sub.currentUsage} / {sub.usageLimit} {sub.usageLimitUnit ?? 'units'}
                  </span>
                  <span>{usagePercent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      getUsageColor(sub.currentUsage, sub.usageLimit),
                    )}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>

                {/* Overage toggle — shown for all metered add-ons with an overage rate */}
                {hasOverage && onToggleOverage && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      Allow overage ({formatCents(sub.addOn.overageRateCents!)}/{sub.usageLimitUnit ?? 'unit'})
                    </span>
                    <Switch
                      checked={sub.allowOverage}
                      onCheckedChange={(checked) => onToggleOverage(sub.addOn.slug, checked)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {onCancel}
        </div>
      </CardContent>
    </Card>
  );
}
