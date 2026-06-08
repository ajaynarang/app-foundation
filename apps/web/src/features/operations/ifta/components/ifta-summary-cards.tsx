'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { DollarSign, CheckCircle2, Route, AlertTriangle } from 'lucide-react';
import { formatCents } from '@/shared/lib/utils/formatters';
import { getIftaLiabilityColor, SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { IftaQuarter } from '../types';

interface IftaSummaryCardsProps {
  quarters: IftaQuarter[] | undefined;
  isLoading: boolean;
  currentYear: number;
}

export function IftaSummaryCards({ quarters, isLoading, currentYear }: IftaSummaryCardsProps) {
  // Derive metrics from quarters list
  const currentQuarters = quarters?.filter((q) => q.year === currentYear) ?? [];
  const latestQuarter =
    currentQuarters.length > 0 ? currentQuarters.reduce((a, b) => (a.quarter > b.quarter ? a : b)) : null;

  const netDueCents = latestQuarter?.netTaxDueCents ?? 0;
  const filedCount = currentQuarters.filter((q) => ['FILED', 'CONFIRMED'].includes(q.status)).length;
  const totalMiles = latestQuarter?.totalMiles ?? 0;
  const anomalyCount = currentQuarters.reduce((sum, q) => sum + (q.anomalyCount ?? 0), 0);

  const liabilityColor = SEMANTIC_COLORS[getIftaLiabilityColor(netDueCents)];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
      {/* Net Tax Due */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Net Tax Due</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {isLoading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <div className={`text-lg sm:text-2xl font-bold ${liabilityColor.text}`}>{formatCents(netDueCents)}</div>
          )}
        </CardContent>
      </Card>

      {/* Quarters Filed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Quarters Filed</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className="text-lg sm:text-2xl font-bold text-foreground">{filedCount} / 4</div>
          )}
        </CardContent>
      </Card>

      {/* Total Miles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Miles</CardTitle>
          <Route className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {isLoading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <div className="text-lg sm:text-2xl font-bold text-foreground">{totalMiles.toLocaleString()}</div>
          )}
        </CardContent>
      </Card>

      {/* Anomalies */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Anomalies</CardTitle>
          <AlertTriangle className={`h-4 w-4 ${anomalyCount > 0 ? 'text-caution' : 'text-muted-foreground'}`} />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {isLoading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <div className={`text-lg sm:text-2xl font-bold ${anomalyCount > 0 ? 'text-caution' : 'text-foreground'}`}>
              {anomalyCount}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
