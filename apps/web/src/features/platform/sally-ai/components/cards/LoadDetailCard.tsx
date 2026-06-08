'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { LoadDetailCardData } from '../../engine/types';
import { loadStatusStyles, stopStatusStyles } from './card-utils';

export function LoadDetailCard({ data }: { data: Record<string, unknown> }) {
  const l = data as unknown as LoadDetailCardData;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header: Load number + status */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{l.loadNumber}</span>
        <Badge className={loadStatusStyles[l.status] ?? ''}>{l.status}</Badge>
      </div>

      {/* Customer name + Ref/PO */}
      <div className="flex items-center justify-between min-w-0">
        <p className="text-xs text-muted-foreground truncate">{l.customerName}</p>
        {l.referenceNumber && (
          <span className="text-2xs text-muted-foreground truncate max-w-[50%] text-right shrink-0">
            Ref: {l.referenceNumber}
          </span>
        )}
      </div>

      {/* 2-column grid: Rate / Weight / Driver / Vehicle */}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <p className="text-2xs text-muted-foreground">Rate</p>
          <p className="text-xs font-medium text-foreground">{l.rateDollars ? `$${l.rateDollars}` : '—'}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">Weight</p>
          <p className="text-xs font-medium text-foreground">
            {l.weightLbs ? `${l.weightLbs.toLocaleString()} lbs` : '—'}
          </p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">Driver</p>
          <p className="text-xs font-medium text-foreground">{l.driver || 'Unassigned'}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">Vehicle</p>
          <p className="text-xs font-medium text-foreground">{l.vehicle || 'Unassigned'}</p>
        </div>
      </div>

      {/* Stops timeline */}
      {l.stops.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-2xs text-muted-foreground font-medium uppercase tracking-wider">Stops</p>
          {l.stops.map((stop, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex flex-col items-center">
                <div
                  className={`h-2 w-2 rounded-full shrink-0 mt-1 ${stop.type === 'pickup' ? SEMANTIC_COLORS.info.dot : SEMANTIC_COLORS.neutral.dot}`}
                />
                {i < l.stops.length - 1 && <div className="w-px h-4 bg-border" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-foreground truncate">{stop.facility}</span>
                  {stop.status && stop.status !== 'pending' && (
                    <Badge className={`${stopStatusStyles[stop.status] ?? ''} text-[9px] px-1 py-0`}>
                      {stop.status}
                    </Badge>
                  )}
                </div>
                <p className="text-2xs text-muted-foreground">{stop.location}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer: doc count + note count */}
      <div className="flex items-center gap-3 text-2xs text-muted-foreground">
        {l.documentCount != null && (
          <span>
            {l.documentCount} doc{l.documentCount !== 1 ? 's' : ''}
          </span>
        )}
        {l.noteCount != null && (
          <span>
            {l.noteCount} note{l.noteCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
