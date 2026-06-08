'use client';

import { formatLoadLabel } from '@sally/shared-types';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { X, Fuel, Clock, Gauge } from 'lucide-react';
import type { MapTruckLocation } from '../../types';

const STATUS_BADGE: Record<MapTruckLocation['status'], { label: string; variant: 'default' | 'muted' | 'outline' }> = {
  moving: { label: 'Moving', variant: 'default' },
  idle: { label: 'Idle', variant: 'muted' },
  parked: { label: 'Parked', variant: 'outline' },
};

const HOS_COLORS: Record<string, string> = {
  safe: 'text-emerald-500',
  warning: 'text-yellow-500',
  critical: 'text-red-500',
  none: 'text-muted-foreground',
};

interface TruckTooltipProps {
  truck: MapTruckLocation;
  onViewLoad: (loadId: string) => void;
  onClose: () => void;
}

export function TruckTooltip({ truck, onViewLoad, onClose }: TruckTooltipProps) {
  const statusInfo = STATUS_BADGE[truck.status];

  return (
    <Card className="w-64 shadow-xl border-border bg-card">
      <CardContent className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">{truck.driverName}</h4>
            <p className="text-xs text-muted-foreground">{truck.vehicleIdentifier}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={statusInfo.variant} className="text-2xs h-5">
              {statusInfo.label}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-0.5">
            <Gauge className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">{truck.speedMph} mph</p>
          </div>
          <div className="space-y-0.5">
            <Clock className={`h-3.5 w-3.5 mx-auto ${HOS_COLORS[truck.hosStatus]}`} />
            <p className="text-xs font-medium text-foreground">
              {truck.hosStatus === 'none'
                ? '--'
                : `${truck.hosDriveRemaining.toFixed(1)}h / ${truck.hosDutyRemaining.toFixed(1)}h`}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {truck.hosStatus === 'none' ? 'no HOS data' : 'drive / duty'}
            </p>
          </div>
          <div className="space-y-0.5">
            <Fuel className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">
              {truck.fuelLevel != null ? `${truck.fuelLevel}%` : '--'}
            </p>
          </div>
        </div>

        {/* Active load */}
        {truck.activeLoad && (
          <div className="rounded-md bg-muted/50 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wide">
                {formatLoadLabel(truck.activeLoad.loadNumber, truck.activeLoad.referenceNumber)}
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] h-4 px-1 ${
                  truck.activeLoad.etaStatus === 'on_time'
                    ? 'text-emerald-500 border-emerald-500/30'
                    : truck.activeLoad.etaStatus === 'at_risk'
                      ? 'text-yellow-500 border-yellow-500/30'
                      : 'text-red-500 border-red-500/30'
                }`}
              >
                {truck.activeLoad.etaStatus?.replace('_', ' ') ?? 'unknown'}
              </Badge>
            </div>
            <p className="text-xs text-foreground">
              {truck.activeLoad.origin.city} → {truck.activeLoad.destination.city}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-6 text-xs mt-1"
              onClick={() => onViewLoad(truck.activeLoad!.loadNumber)}
            >
              View Load
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
