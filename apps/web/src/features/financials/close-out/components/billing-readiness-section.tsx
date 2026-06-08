'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { CheckCircle, XCircle, AlertCircle, Minus, Upload, Eye, RefreshCw } from 'lucide-react';
import { formatCents } from '@/shared/lib/utils/formatters';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { BillingReadinessItem, BillingReadinessResult } from '../types';

interface Props {
  readiness: BillingReadinessResult | undefined;
  loading: boolean;
  refreshing?: boolean;
  onUploadClick?: (documentType: string, relatedStopId?: number) => void;
  onViewDoc?: (documentId: number) => void;
  onRefresh?: () => void;
}

function getBarColor(score: number, hasBlockers: boolean) {
  if (hasBlockers) return SEMANTIC_COLORS.critical.dot;
  if (score === 100) return SEMANTIC_COLORS.neutral.dot;
  if (score >= 50) return SEMANTIC_COLORS.caution.dot;
  return SEMANTIC_COLORS.critical.dot;
}

function ItemIcon({ item }: { item: BillingReadinessItem }) {
  if (item.status === 'satisfied') {
    return <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
  }
  if (item.status === 'overdue') {
    return <AlertCircle className={`h-4 w-4 ${SEMANTIC_COLORS.critical.text} shrink-0 mt-0.5`} />;
  }
  if (item.enforcement === 'recommended') {
    return <Minus className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
  }
  return <XCircle className={`h-4 w-4 ${SEMANTIC_COLORS.critical.text} shrink-0 mt-0.5`} />;
}

function ReadinessItem({
  item,
  onUploadClick,
  onViewDoc,
}: {
  item: BillingReadinessItem;
  onUploadClick?: (documentType: string, relatedStopId?: number) => void;
  onViewDoc?: (documentId: number) => void;
}) {
  const isRecommended = item.enforcement === 'recommended';
  const showUpload = item.category === 'document' && item.status !== 'satisfied';
  const canViewDoc = item.category === 'document' && item.status === 'satisfied' && item.satisfiedBy;

  return (
    <div className="flex items-start gap-3 py-2">
      <ItemIcon item={item} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {canViewDoc && onViewDoc ? (
            <button
              type="button"
              className={`text-sm font-medium text-foreground hover:underline cursor-pointer text-left`}
              onClick={() => onViewDoc(item.satisfiedBy!.documentId)}
            >
              {item.label}
            </button>
          ) : (
            <span className={`text-sm font-medium ${isRecommended ? 'text-muted-foreground' : 'text-foreground'}`}>
              {item.label}
            </span>
          )}
          {item.relatedStopName && (
            <span className="text-xs text-muted-foreground">&middot; {item.relatedStopName}</span>
          )}
          {item.status === 'overdue' && (
            <Badge variant="destructive" className="text-2xs px-1.5 py-0">
              Overdue
            </Badge>
          )}
          {isRecommended && item.status !== 'satisfied' && (
            <Badge variant="outline" className="text-2xs px-1.5 py-0">
              Recommended
            </Badge>
          )}
        </div>
        <p className={`text-xs ${item.status === 'overdue' ? SEMANTIC_COLORS.critical.text : 'text-muted-foreground'}`}>
          {item.reason}
        </p>
      </div>
      {item.amountCents != null && item.status === 'satisfied' && (
        <span className="text-sm font-medium text-foreground shrink-0">{formatCents(item.amountCents)}</span>
      )}
      {canViewDoc && onViewDoc && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-7 text-xs"
          onClick={() => onViewDoc(item.satisfiedBy!.documentId)}
        >
          <Eye className="mr-1 h-3 w-3" />
          View
        </Button>
      )}
      {showUpload && onUploadClick && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-7 text-xs"
          onClick={() => onUploadClick(item.type, item.relatedStopId)}
        >
          <Upload className="mr-1 h-3 w-3" />
          Upload
        </Button>
      )}
    </div>
  );
}

export function BillingReadinessSection({
  readiness,
  loading,
  refreshing,
  onUploadClick,
  onViewDoc,
  onRefresh,
}: Props) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!readiness) return null;

  const documentItems = readiness.items.filter((i) => i.category === 'document');
  const chargeItems = readiness.items.filter((i) => i.category === 'charge');
  const barColor = getBarColor(readiness.score, readiness.hasBlockers);

  return (
    <Card>
      <CardContent className="p-4">
        {/* Header + Progress */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-foreground text-sm">Billing Readiness</h3>
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={onRefresh}
                disabled={refreshing}
                title="Re-check readiness"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {readiness.totalSatisfied}/{readiness.totalRequired} &middot; {readiness.score}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={readiness.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Billing readiness: ${readiness.score}%`}
          className="w-full bg-muted rounded-full h-2 mb-4"
        >
          <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${readiness.score}%` }} />
        </div>

        {/* Document Items */}
        {documentItems.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Documents</p>
            <div className="divide-y divide-border">
              {documentItems.map((item) => (
                <ReadinessItem
                  key={`${item.type}-${item.relatedStopId ?? 'load'}`}
                  item={item}
                  onUploadClick={onUploadClick}
                  onViewDoc={onViewDoc}
                />
              ))}
            </div>
          </div>
        )}

        {/* Charge Items */}
        {chargeItems.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Charges</p>
            <div className="divide-y divide-border">
              {chargeItems.map((item) => (
                <ReadinessItem key={`charge-${item.type}`} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Override notice */}
        {readiness.overrideExists && (
          <div className={`mt-3 p-2 rounded-md ${SEMANTIC_COLORS.caution.bg} border ${SEMANTIC_COLORS.caution.border}`}>
            <p className={`text-xs ${SEMANTIC_COLORS.caution.text}`}>
              Overridden by {readiness.overrideExists.overriddenBy}: &ldquo;{readiness.overrideExists.reason}&rdquo;
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
