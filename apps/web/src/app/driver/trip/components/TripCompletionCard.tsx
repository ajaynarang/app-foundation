'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { cn } from '@sally/ui';
import { TripDashboard } from './TripDashboard';
import { DocUploadInline } from './DocUploadInline';
import { stopHasPrimaryDoc, getStopDocTypeLabel } from '../lib/stop-docs';
import type { Load } from '@/features/fleet/loads/types';
import type { RoutePlanResult } from '@/features/routing/route-planning';

function formatDuration(ms: number): string {
  const h = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(h / 24);
  const remH = h % 24;
  if (days > 0) return `${days}d ${remH}h`;
  return `${h}h`;
}

interface Props {
  load: Load;
  plan?: RoutePlanResult;
  driverName: string;
  /** Stops that still need doc uploads (BOL/POD) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingDocStops?: any[];
}

export function TripCompletionCard({ load, plan, driverName, pendingDocStops = [] }: Props) {
  const stops = useMemo(() => [...(load.stops ?? [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder), [load.stops]);
  const [expandedStopId, setExpandedStopId] = useState<number | null>(
    // Auto-expand the first stop that needs docs
    pendingDocStops.length > 0 ? (pendingDocStops[0]?.id ?? null) : null,
  );
  const hasPendingDocs = pendingDocStops.length > 0;

  // Trip stats
  const totalMiles = plan ? plan.segments.reduce((acc, s) => acc + (s.distanceMiles ?? 0), 0) : undefined;

  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const tripMs =
    firstStop?.arrivedAt && lastStop?.completedAt
      ? new Date(lastStop.completedAt).getTime() - new Date(firstStop.arrivedAt).getTime()
      : undefined;

  return (
    <div className="space-y-4 py-4">
      {/* Hero card — adapts tone based on pending docs */}
      <Card
        className={cn(
          'overflow-hidden',
          hasPendingDocs
            ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/30'
            : 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30',
        )}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center shrink-0 border',
                hasPendingDocs ? 'border-yellow-300 dark:border-yellow-700' : 'border-border',
              )}
            >
              <Check
                className={cn('h-5 w-5', hasPendingDocs ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground')}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">
                {hasPendingDocs
                  ? `Almost done! Upload ${pendingDocStops.length === 1 ? 'document' : 'documents'}`
                  : `Load ${load.loadNumber}${load.referenceNumber ? ` · ${load.referenceNumber}` : ''} — Delivered`}
              </p>
              {hasPendingDocs && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                  {pendingDocStops.length} {pendingDocStops.length === 1 ? 'stop needs' : 'stops need'} documents before
                  closing out
                </p>
              )}
              {load.customerName && <p className="text-sm text-muted-foreground truncate">{load.customerName}</p>}
            </div>
          </div>

          {/* Trip summary stats */}
          {(totalMiles != null || tripMs != null) && (
            <div className="flex gap-4 text-sm">
              {totalMiles != null && (
                <div>
                  <p className="text-base font-semibold text-foreground">{Math.round(totalMiles).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Miles</p>
                </div>
              )}
              {tripMs != null && (
                <div>
                  <p className="text-base font-semibold text-foreground">{formatDuration(tripMs)}</p>
                  <p className="text-xs text-muted-foreground">Total time</p>
                </div>
              )}
              <div>
                <p className="text-base font-semibold text-foreground">{stops.length}</p>
                <p className="text-xs text-muted-foreground">Stops</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tappable completed stops */}
      {stops.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed Stops</p>
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {stops.map((stop) => {
              const isExpanded = expandedStopId === stop.id;
              const hasDoc = stopHasPrimaryDoc(stop);
              const docType = getStopDocTypeLabel(stop);

              return (
                <div key={stop.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-card text-left"
                    onClick={() => setExpandedStopId(isExpanded ? null : stop.id)}
                  >
                    <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{stop.stopName || stop.actionType}</p>
                      {(stop.stopCity || stop.stopState) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[stop.stopCity, stop.stopState].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    {hasDoc ? (
                      <span className="text-2xs font-medium text-green-400 bg-green-400/10 rounded px-1.5 py-0.5 shrink-0">
                        ✓ {docType}
                      </span>
                    ) : (
                      <span className="text-2xs font-medium text-yellow-400 bg-yellow-400/10 rounded px-1.5 py-0.5 shrink-0">
                        ● Docs needed
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform',
                        isExpanded && 'rotate-180',
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="mx-3 mb-2 rounded-lg border border-border bg-card/50 p-3 space-y-3">
                      {/* Stop details */}
                      <div className="text-xs text-muted-foreground space-y-1">
                        {stop.stopName && <p className="font-medium text-foreground">{stop.stopName}</p>}
                        {stop.stopAddress && <p>{stop.stopAddress}</p>}
                        {(stop.stopCity || stop.stopState) && (
                          <p>{[stop.stopCity, stop.stopState].filter(Boolean).join(', ')}</p>
                        )}
                        {stop.arrivedAt && (
                          <p>
                            Arrived:{' '}
                            {new Date(stop.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {stop.completedAt && (
                          <p>
                            Completed:{' '}
                            {new Date(stop.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>

                      {/* Documents section */}
                      <div className="border-t border-border pt-2">
                        <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Documents
                        </p>
                        {hasDoc && (
                          <div className="flex items-center gap-2 text-xs mb-2">
                            <Check className="h-3 w-3 text-green-400" />
                            <span className="text-green-400">{docType} uploaded</span>
                          </div>
                        )}
                        <DocUploadInline
                          stopId={String(stop.id)}
                          loadId={load.loadNumber}
                          documentType={docType}
                          isAdditional={hasDoc}
                          onUploaded={() => setExpandedStopId(null)}
                          onSkip={() => setExpandedStopId(null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reuse TripDashboard for upcoming loads + stats (no-load state) */}
      <div className="border-t border-border pt-4">
        <TripDashboard driverName={driverName} />
      </div>
    </div>
  );
}
