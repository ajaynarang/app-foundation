'use client';

import { useMemo } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Separator } from '@sally/ui/components/ui/separator';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Calculator, FileCheck, CheckCircle2, Send } from 'lucide-react';
import { formatCents } from '@/shared/lib/utils/formatters';
import { getIftaLiabilityColor, SEMANTIC_COLORS } from '@/shared/lib/colors';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import {
  useIftaQuarterDetail,
  useIftaQuarterSummary,
  useCalculateQuarter,
  useUpdateFilingStatus,
} from '../hooks/use-ifta';
import { IftaFilingStatusBadge } from './ifta-filing-status-badge';
import { IftaAnomalyCallouts } from './ifta-anomaly-callouts';
import { IftaStateBreakdownTable } from './ifta-state-breakdown-table';
import { QUARTER_LABELS } from '../constants';
import type { IftaQuarterStatus, IftaStateCalculation } from '../types';

interface IftaQuarterDetailSheetProps {
  quarterId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IftaQuarterDetailSheet({ quarterId, open, onOpenChange }: IftaQuarterDetailSheetProps) {
  const sizing = useSheetSizing('ifta-quarter');
  const { data: quarter, isLoading: quarterLoading } = useIftaQuarterDetail(quarterId);
  const { data: summary, isLoading: summaryLoading } = useIftaQuarterSummary(quarterId);
  const calculateMutation = useCalculateQuarter();
  const updateStatusMutation = useUpdateFilingStatus();

  const isLoading = quarterLoading || summaryLoading;

  // Build state breakdown from calculation data or from stateMileage on the quarter
  const stateBreakdown: IftaStateCalculation[] = useMemo(() => {
    if (!quarter?.stateMileage) return [];
    return quarter.stateMileage.map((sm) => ({
      jurisdiction: sm.jurisdiction,
      jurisdictionName: sm.jurisdiction,
      totalMiles: sm.totalMiles,
      taxableGallons: sm.taxableGallons ?? 0,
      fuelPurchasedGallons: 0,
      taxRate: sm.taxRatePerGallon ?? 0,
      surchargeRate: sm.surchargeRate ?? 0,
      taxOwedCents: sm.taxOwedCents ?? 0,
      surchargeOwedCents: sm.surchargeOwedCents ?? 0,
      taxPaidCents: 0,
      netTaxCents: sm.taxOwedCents ?? 0,
    }));
  }, [quarter?.stateMileage]);

  const handleCalculate = () => {
    if (quarterId) {
      calculateMutation.mutate(quarterId);
    }
  };

  const handleUpdateStatus = (status: IftaQuarterStatus) => {
    if (quarterId) {
      updateStatusMutation.mutate({ quarterId, data: { status } });
    }
  };

  const netDueCents = summary?.netTaxDueCents ?? quarter?.netTaxDueCents ?? 0;
  const liabilityColor = SEMANTIC_COLORS[getIftaLiabilityColor(netDueCents)];

  const deadlineDays = summary?.daysUntilDeadline;
  const deadlineLabel =
    deadlineDays != null
      ? deadlineDays > 0
        ? `${deadlineDays} days until deadline`
        : deadlineDays === 0
          ? 'Deadline is today'
          : `${Math.abs(deadlineDays)} days past deadline`
      : null;

  const title = quarter ? `${QUARTER_LABELS[quarter.quarter]} ${quarter.year} IFTA Return` : 'IFTA Quarter Detail';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 flex flex-col"
        pinnable
        resizable
        defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
      >
        <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="ifta-quarter" /> : undefined}>
          <div className="flex items-center gap-3">
            <SheetTitle>{title}</SheetTitle>
            {quarter && <IftaFilingStatusBadge status={quarter.status} />}
          </div>
          <SheetDescription className="sr-only">
            IFTA quarter detail view with mileage, fuel, and tax breakdown by state
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Miles</p>
                    <p className="text-lg font-semibold text-foreground">
                      {(summary?.totalMiles ?? quarter?.totalMiles ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Gallons</p>
                    <p className="text-lg font-semibold text-foreground">
                      {(summary?.totalGallons ?? quarter?.totalGallons ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Fleet MPG</p>
                    <p className="text-lg font-semibold text-foreground">
                      {summary?.fleetAvgMpg?.toFixed(2) ?? '\u2014'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Net Due</p>
                    <p className={`text-lg font-semibold ${liabilityColor.text}`}>{formatCents(netDueCents)}</p>
                  </div>
                </div>

                {/* Deadline countdown */}
                {deadlineLabel && (
                  <p
                    className={`text-sm ${deadlineDays != null && deadlineDays < 0 ? 'text-critical' : deadlineDays != null && deadlineDays <= 14 ? 'text-caution' : 'text-muted-foreground'}`}
                  >
                    {summary?.filingDeadline && (
                      <span className="font-medium">Deadline: {summary.filingDeadline} </span>
                    )}
                    ({deadlineLabel})
                  </p>
                )}

                <Separator />

                {/* Anomalies */}
                {quarter?.anomalies && quarter.anomalies.length > 0 && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">Anomalies</h3>
                      <IftaAnomalyCallouts anomalies={quarter.anomalies} />
                    </div>
                    <Separator />
                  </>
                )}

                {/* State Breakdown */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">State Breakdown</h3>
                  <IftaStateBreakdownTable breakdown={stateBreakdown} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sticky footer with action buttons */}
        {quarter && !isLoading && (
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            <div className="flex-1" />
            {quarter.status === 'OPEN' && (
              <Button onClick={handleCalculate} loading={calculateMutation.isPending}>
                <Calculator className="mr-2 h-4 w-4" />
                Calculate
              </Button>
            )}
            {quarter.status === 'DRAFT' && (
              <Button onClick={() => handleUpdateStatus('REVIEWED')} loading={updateStatusMutation.isPending}>
                <FileCheck className="mr-2 h-4 w-4" />
                Mark Reviewed
              </Button>
            )}
            {quarter.status === 'REVIEWED' && (
              <Button onClick={() => handleUpdateStatus('FILED')} loading={updateStatusMutation.isPending}>
                <Send className="mr-2 h-4 w-4" />
                File Return
              </Button>
            )}
            {quarter.status === 'FILED' && (
              <Button onClick={() => handleUpdateStatus('CONFIRMED')} loading={updateStatusMutation.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
