'use client';

import {
  Package,
  PackageCheck,
  Fuel,
  Moon,
  Coffee,
  MapPin,
  Clock,
  CheckCircle,
  Navigation,
  FileText,
} from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import type { LoadStop } from '@/features/fleet/loads/types';
import { formatStopAddress } from '../lib/format-stop-address';
import { useFormatters } from '@/shared/providers/PreferencesProvider';

type StopState = 'completed' | 'current' | 'upcoming';

interface RouteStopCardProps {
  stop: LoadStop;
  state: StopState;
  stopNumber: number;
  onNavigate?: () => void;
  onUploadDoc?: () => void;
  children?: React.ReactNode;
}

function getStopIcon(actionType: string) {
  switch (actionType) {
    case 'pickup':
      return Package;
    case 'delivery':
      return PackageCheck;
    case 'fuel':
      return Fuel;
    case 'rest':
      return Moon;
    case 'break':
      return Coffee;
    default:
      return MapPin;
  }
}

export function RouteStopCard({ stop, state, stopNumber, onNavigate, onUploadDoc, children }: RouteStopCardProps) {
  const { formatTime } = useFormatters();
  const Icon = getStopIcon(stop.actionType);
  const address = formatStopAddress(stop);

  if (state === 'completed') {
    const docType = stop.actionType === 'delivery' ? 'POD' : 'BOL';
    const hasDoc = stop.actionType === 'delivery' ? !!stop.podSignedBy : !!stop.bolNumber;

    return (
      <div className="opacity-60">
        <div className="flex items-center gap-3 py-2">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{stop.stopName || `Stop ${stopNumber}`}</p>
            {stop.completedAt && (
              <p className="text-xs text-muted-foreground">Completed at {formatTime(stop.completedAt)}</p>
            )}
          </div>
          {/* Doc badge — always visible after completion */}
          {(stop.actionType === 'pickup' || stop.actionType === 'delivery') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onUploadDoc}
              className={cn(
                'h-auto px-2 py-1 rounded-full text-xs font-medium gap-1',
                hasDoc
                  ? 'bg-muted text-muted-foreground hover:bg-muted'
                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60',
              )}
            >
              <FileText className="h-3 w-3" />
              {docType}
              {!hasDoc && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 ml-0.5" />}
            </Button>
          )}
        </div>
        {children}
      </div>
    );
  }

  const isCurrent = state === 'current';

  return (
    <Card className={isCurrent ? 'border-foreground/30 shadow-sm' : ''}>
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
              isCurrent ? 'bg-foreground text-background' : 'bg-muted'
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{stop.stopName || `Stop ${stopNumber}`}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{address || 'Address unavailable'}</span>
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs capitalize">
            {stop.actionType}
          </Badge>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pl-11">
          {stop.appointmentDate && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(stop.appointmentDate)}
            </span>
          )}
        </div>

        {/* Actions for current stop */}
        {isCurrent && (
          <div className="flex gap-2 pl-11">
            <Button size="sm" className="flex-1 h-9" onClick={onNavigate}>
              <Navigation className="mr-1 h-3.5 w-3.5" />
              Navigate
            </Button>
          </div>
        )}

        {/* Injected content (e.g., StopCompletionFlow) */}
        {children && <div className="pl-11">{children}</div>}
      </CardContent>
    </Card>
  );
}
