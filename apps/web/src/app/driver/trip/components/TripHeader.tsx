'use client';

import { useState } from 'react';
import { ChevronUp, FileText, Eye, Share2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { STOP_STATUS } from '../lib/constants';
import { loadsApi } from '@/features/fleet/loads/api';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { cn } from '@sally/ui';
import { stopHasDocument } from '../lib/stop-docs';
import type { Load } from '@/features/fleet/loads/types';
import type { RoutePlanResult } from '@/features/routing/route-planning';

const STATUS_BADGE: Record<string, string> = {
  ASSIGNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  IN_TRANSIT: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  at_pickup: 'bg-caution/10 text-caution',
  at_delivery: 'bg-caution/10 text-caution',
  DELIVERED: 'bg-muted text-muted-foreground',
};

function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildRouteLabel(load: Load): string {
  const stops = [...(load.stops ?? [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last || first === last) return '';
  const fmt = (s: typeof first) => [s.stopCity ?? '', s.stopState ?? ''].filter(Boolean).join(', ');
  const origin = fmt(first);
  const dest = fmt(last);
  if (!origin && !dest) return '';
  return `${origin} → ${dest}`;
}

interface Props {
  load: Load;
  plan?: RoutePlanResult;
}

export function TripHeader({ load, plan }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Dispatch sheet: resolve the leg to use (first non-delivered leg, or first leg)
  const dispatchLegId = load.legs?.find((l) => l.status !== 'DELIVERED')?.legId ?? load.legs?.[0]?.legId ?? null;

  const viewDispatchPdf = useMutation({
    mutationFn: () => loadsApi.getDispatchSheetPdf(load.loadNumber, dispatchLegId!),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    },
    onError: (err: Error) => {
      showError('Could not load dispatch sheet', err.message);
    },
  });

  const shareDispatchSheet = useMutation({
    mutationFn: async () => {
      const blob = await loadsApi.getDispatchSheetPdf(load.loadNumber, dispatchLegId!);
      const file = new File([blob], `dispatch-sheet-${load.loadNumber}.pdf`, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Dispatch Sheet — ${load.loadNumber}` });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSuccess('Dispatch sheet downloaded');
      }
    },
    onError: (err: Error) => {
      if (err?.name !== 'AbortError') {
        showError('Share failed', err?.message ?? 'Unable to share dispatch sheet');
      }
    },
  });

  const stops = [...(load.stops ?? [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const docAudit = stops
    .filter((s) => s.actionType === 'pickup' || s.actionType === 'delivery')
    .map((s) => ({
      stop: s,
      docLabel: s.actionType === 'delivery' ? 'POD' : 'BOL',
      uploaded: s.actionType === 'delivery' ? stopHasDocument(s, 'pod') : stopHasDocument(s, 'bol'),
    }));

  const routeLabel = buildRouteLabel(load);
  const weightLabel = load.weightLbs ? `${load.weightLbs.toLocaleString()} lbs` : null;
  const line3Parts = [routeLabel, weightLabel].filter(Boolean);

  return (
    <>
      {/* Tappable summary card — opens bottom sheet with full details */}
      <button type="button" className="w-full text-left py-1.5" onClick={() => setSheetOpen(true)}>
        <Card className="border-border/60 bg-card/50 hover:bg-muted/30 transition-colors shadow-none">
          <CardContent className="px-3 py-2 space-y-0.5">
            {/* Line 1: Load number · Ref + status + chevron */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="text-sm font-semibold text-foreground shrink-0">{load.loadNumber}</span>
                {load.referenceNumber && (
                  <>
                    <span className="text-muted-foreground text-xs shrink-0">·</span>
                    <span className="text-xs text-muted-foreground truncate">Ref: {load.referenceNumber}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge
                  className={cn(
                    'text-xs px-1.5 py-0.5 border-0',
                    STATUS_BADGE[load.status ?? ''] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {statusLabel(load.status ?? '')}
                </Badge>
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>

            {/* Line 2: Customer */}
            {load.customerName && <p className="text-xs text-muted-foreground truncate">{load.customerName}</p>}

            {/* Line 3: Route + weight */}
            {line3Parts.length > 0 && (
              <p className="text-xs text-muted-foreground truncate">{line3Parts.join(' · ')}</p>
            )}
          </CardContent>
        </Card>
      </button>

      {/* Bottom sheet with full load details */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto rounded-t-2xl border-border bg-card px-0 pb-8 pt-0"
        >
          {/* Drag handle — matches HOS sheet */}
          <div className="flex justify-center pt-3 pb-1" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          <SheetHeader className="px-6 pb-3 pt-2 text-left">
            <SheetTitle className="text-base font-semibold text-foreground">
              {load.loadNumber}
              {load.referenceNumber && (
                <span className="text-sm font-normal text-muted-foreground ml-2">Ref: {load.referenceNumber}</span>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 px-6 pt-2">
            {/* Status + customer */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{load.customerName}</span>
              <Badge
                className={cn(
                  'text-xs px-1.5 py-0.5 border-0',
                  STATUS_BADGE[load.status ?? ''] ?? 'bg-muted text-muted-foreground',
                )}
              >
                {statusLabel(load.status ?? '')}
              </Badge>
            </div>

            {/* Load details grid */}
            <div className="space-y-2 text-sm">
              {routeLabel && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Route</span>
                  <span className="text-foreground text-right">{routeLabel}</span>
                </div>
              )}
              {load.weightLbs && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Weight</span>
                  <span className="text-foreground">{load.weightLbs.toLocaleString()} lbs</span>
                </div>
              )}
              {load.commodityType && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Commodity</span>
                  <span className="text-foreground text-right truncate">{load.commodityType}</span>
                </div>
              )}
              {load.requiredEquipmentType && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Equipment</span>
                  <span className="text-foreground">{load.requiredEquipmentType.replace(/_/g, ' ')}</span>
                </div>
              )}
              {load.referenceNumber && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="text-foreground font-mono text-xs">{load.referenceNumber}</span>
                </div>
              )}
              {load.specialRequirements && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Special</span>
                  <span className="text-foreground text-right">{load.specialRequirements}</span>
                </div>
              )}

              {/* Smart route progress */}
              {plan &&
                (plan.segments?.length ?? 0) > 0 &&
                (() => {
                  const total = plan.segments!.length;
                  const completed = plan.segments!.filter(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (s) => (s as any).status === 'completed' || (s as any).status === 'skipped',
                  ).length;
                  const pct = Math.round((completed / total) * 100);
                  return (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Route progress</span>
                      <span className="text-foreground">
                        {completed}/{total} segments · {pct}%
                      </span>
                    </div>
                  );
                })()}
            </div>

            {/* Dispatch Sheet */}
            {dispatchLegId && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dispatch Sheet</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs"
                    loading={viewDispatchPdf.isPending}
                    onClick={() => viewDispatchPdf.mutate()}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    View PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs"
                    loading={shareDispatchSheet.isPending}
                    onClick={() => shareDispatchSheet.mutate()}
                  >
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    Share
                  </Button>
                </div>
              </div>
            )}

            {!dispatchLegId && (
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">Dispatch sheet not yet available</p>
              </div>
            )}

            {/* Documents */}
            {docAudit.length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documents</p>
                {docAudit.map(({ stop, docLabel, uploaded }) => (
                  <div key={stop.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Stop {stop.sequenceOrder} · {stop.actionType}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={uploaded ? 'text-foreground' : 'text-caution'}>
                        {docLabel} {uploaded ? '✓' : '● needed'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stops summary */}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stops</p>
              {stops.map((stop) => (
                <div key={stop.id} className="flex items-center gap-2 text-sm">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: stop.status === STOP_STATUS.COMPLETED ? '#22c55e' : '#71717a',
                    }}
                  />
                  <span className="text-foreground truncate flex-1">
                    {stop.actionType === 'pickup' ? 'Pickup' : 'Delivery'}
                    {stop.stopName ? ` — ${stop.stopName}` : ''}
                  </span>
                  {stop.stopCity && <span className="text-xs text-muted-foreground shrink-0">{stop.stopCity}</span>}
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
