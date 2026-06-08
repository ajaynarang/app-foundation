'use client';

import { Brain, Building2, User } from 'lucide-react';
import { cn } from '@sally/ui';
import { useLumperInsights } from '@/features/fleet/loads/hooks/use-money-codes';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

interface SallyInsightsCardProps {
  loadId: string;
  requestedCents: number;
}

export function SallyInsightsCard({ loadId, requestedCents }: SallyInsightsCardProps) {
  const { data: insights, isLoading } = useLumperInsights(loadId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Brain className="h-3 w-3" />
          Sally Insights
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!insights) return null;

  const facilityAvg = insights.facilityAvg;
  const driverHistory = insights.driverHistory;

  // Compare request to facility average
  let facilityComparison: string | null = null;
  if (facilityAvg && requestedCents > 0) {
    const diff = requestedCents - facilityAvg.avg;
    const pct = Math.round((Math.abs(diff) / facilityAvg.avg) * 100);
    if (pct > 10) {
      facilityComparison = diff > 0 ? `${pct}% above avg` : `${pct}% below avg`;
    } else {
      facilityComparison = 'Near average';
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Brain className="h-3 w-3" />
        Sally Insights
      </div>

      <div className="space-y-1.5">
        {/* Facility average */}
        {facilityAvg && (
          <div className="flex items-center gap-2 text-xs">
            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              {insights.facilityName ?? 'Facility'}: avg ${(facilityAvg.avg / 100).toFixed(0)} ({facilityAvg.count}{' '}
              loads)
            </span>
            {facilityComparison && (
              <span
                className={cn(
                  'text-2xs font-medium',
                  facilityComparison.includes('above') ? 'text-yellow-400' : 'text-muted-foreground',
                )}
              >
                · {facilityComparison}
              </span>
            )}
          </div>
        )}

        {/* Driver history */}
        {driverHistory && (
          <div className="flex items-center gap-2 text-xs">
            <User className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              Driver: {driverHistory.count} past request{driverHistory.count !== 1 ? 's' : ''}
              {driverHistory.allMatched && ' · All matched receipt'}
            </span>
          </div>
        )}

        {/* No data fallback */}
        {!facilityAvg && !driverHistory && (
          <p className="text-xs text-muted-foreground italic">No historical data available</p>
        )}
      </div>
    </div>
  );
}
