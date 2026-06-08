'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { FileText, CheckCircle, Receipt } from 'lucide-react';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { formatCents } from '@/shared/lib/utils/formatters';
import type { CloseOutSummary } from '../types';

interface Props {
  summary: CloseOutSummary | undefined;
  loading: boolean;
}

export function CloseOutSummaryCards({ summary, loading }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Needs Docs</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <>
              <div className="text-2xl font-bold text-foreground">{summary?.needsDocs ?? 0}</div>
              {(summary?.overduePods ?? 0) > 0 && (
                <p className={`text-xs ${SEMANTIC_COLORS.critical.text} mt-1`}>{summary?.overduePods} POD overdue</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Ready to Review</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold text-foreground">{summary?.readyForReview ?? 0}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Ready to Bill</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <>
              <div className="text-2xl font-bold text-foreground">{summary?.readyToBill ?? 0}</div>
              {(summary?.readyToBillTotalCents ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCents(summary?.readyToBillTotalCents ?? 0)} total
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
