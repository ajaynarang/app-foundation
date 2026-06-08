'use client';

import { Navigation } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { normalizeTimeString } from '@sally/shared-types';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import type { LoadStop } from '@/features/fleet/loads/types';

interface StopTimelineProps {
  stops: LoadStop[];
  showExchangeStyle?: boolean;
}

export function StopTimeline({ stops, showExchangeStyle }: StopTimelineProps) {
  const { formatCalendarDate } = useFormatters();

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stops</h4>
      {stops.map((stop, idx) => (
        <div key={stop.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                stop.actionType === 'pickup'
                  ? 'bg-accent/10 text-accent'
                  : showExchangeStyle && stop.actionType === 'exchange'
                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {idx + 1}
            </div>
            {idx < stops.length - 1 && <div className="w-0.5 h-4 bg-border" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={stop.actionType === 'pickup' ? 'default' : 'muted'} className="text-2xs">
                {stop.actionType}
              </Badge>
              <span className="text-sm font-medium text-foreground truncate">{stop.stopName || 'Stop'}</span>
              {stop.stopLat != null && stop.stopLon != null ? (
                <span title={`${stop.stopLat.toFixed(4)}, ${stop.stopLon.toFixed(4)}`}>
                  <Navigation className="h-3 w-3 text-accent flex-shrink-0" />
                </span>
              ) : (
                <span
                  className="inline-block h-2 w-2 rounded-full bg-caution flex-shrink-0"
                  title="No coordinates — geocoding pending"
                />
              )}
            </div>
            {stop.stopAddress && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {stop.stopCity}, {stop.stopState}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {stop.appointmentDate && `${formatCalendarDate(stop.appointmentDate, DISPLAY_FORMATS.FRIENDLY)}`}
              {stop.earliestArrival &&
                ` · ${normalizeTimeString(stop.earliestArrival)}${stop.latestArrival ? `–${normalizeTimeString(stop.latestArrival)}` : ''}`}
              {(stop.appointmentDate || stop.earliestArrival) && ' · '}
              Dock: {stop.estimatedDockHours}h
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
