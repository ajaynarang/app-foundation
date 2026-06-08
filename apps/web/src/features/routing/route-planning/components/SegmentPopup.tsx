'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { Moon, Fuel, Warehouse, PackageCheck, Coffee, Truck, MapPin, Flag } from 'lucide-react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { formatDurationHours as formatDuration } from '@/shared/lib/format-time';
import { formatHours } from './plan-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SegmentPopupProps {
  properties: Record<string, string | number | boolean | null | undefined>;
}

function hosLabel(driven: number | null, cycle: number | null): string | null {
  if (driven == null && cycle == null) return null;
  const parts: string[] = [];
  // HOS values are compliance evidence — never round to a higher hour.
  if (driven != null) parts.push(`${formatHours(Number(driven))} driven`);
  if (cycle != null) parts.push(`${formatHours(70 - Number(cycle))} cycle left`);
  return parts.join(' | ');
}

// ─── Sub-renderers ──────────────────────────────────────────────────────────

function RestPopup({ p }: { p: SegmentPopupProps['properties'] }) {
  const { formatTimestamp } = useFormatters();
  const hos = hosLabel(p.hosHoursDriven as number | null, p.hosCycleHoursUsed as number | null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Moon className="h-3.5 w-3.5 text-purple-400" />
        <Badge variant="outline" className="text-2xs px-1.5 py-0 text-purple-400 border-purple-600">
          REST
        </Badge>
      </div>
      {p.name && <p className="font-medium text-sm text-foreground">{String(p.name)}</p>}
      {p.location && p.location !== p.name && <p className="text-xs text-muted-foreground">{String(p.location)}</p>}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {p.restDurationHours != null && (
          <p>
            {formatDuration(Number(p.restDurationHours))} {p.restType ? String(p.restType).replace(/_/g, ' ') : 'rest'}
          </p>
        )}
        {p.restReason && <p className="italic">Reason: {String(p.restReason)}</p>}
        {hos && <p>HOS: {hos}</p>}
        {p.estimatedDeparture && <p>Depart: {formatTimestamp(String(p.estimatedDeparture))}</p>}
      </div>
    </div>
  );
}

function FuelPopup({ p }: { p: SegmentPopupProps['properties'] }) {
  const { formatTimestamp } = useFormatters();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Fuel className="h-3.5 w-3.5 text-amber-400" />
        <Badge variant="outline" className="text-2xs px-1.5 py-0 text-amber-400 border-amber-600">
          FUEL
        </Badge>
      </div>
      {p.fuelStationName && <p className="font-medium text-sm text-foreground">{String(p.fuelStationName)}</p>}
      {p.name && p.name !== p.fuelStationName && <p className="text-xs text-muted-foreground">{String(p.name)}</p>}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {p.fuelGallons != null && p.fuelPricePerGallon != null && (
          <p>
            {Number(p.fuelGallons).toFixed(0)} gal @ ${Number(p.fuelPricePerGallon).toFixed(2)}/gal
            {p.fuelCostEstimate != null && ` = $${Number(p.fuelCostEstimate).toFixed(2)}`}
          </p>
        )}
        {p.detourMiles != null && Number(p.detourMiles) > 0 && (
          <p>Detour: {Number(p.detourMiles).toFixed(1)} mi off route</p>
        )}
        {p.fuelRangeAfterMiles != null && <p>Range after: {Number(p.fuelRangeAfterMiles).toFixed(0)} mi</p>}
        {p.estimatedDeparture && <p>Depart: {formatTimestamp(String(p.estimatedDeparture))}</p>}
      </div>
    </div>
  );
}

function DockPopup({ p }: { p: SegmentPopupProps['properties'] }) {
  const { formatTimestamp } = useFormatters();
  const isPickup = String(p.actionType ?? '')
    .toLowerCase()
    .includes('pickup');
  const Icon = isPickup ? PackageCheck : Warehouse;
  const label = isPickup ? 'PICKUP' : 'DELIVERY';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-blue-400" />
        <Badge variant="outline" className="text-2xs px-1.5 py-0 text-blue-400 border-blue-600">
          {label}
        </Badge>
      </div>
      {p.customerName && <p className="font-medium text-sm text-foreground">{String(p.customerName)}</p>}
      {p.name && <p className="text-xs text-muted-foreground">{String(p.name)}</p>}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {p.dockDurationHours != null && <p>Est. dock time: {formatDuration(Number(p.dockDurationHours))}</p>}
        {p.isDocktimeConverted && <p className="italic text-muted-foreground">Dock time counts as rest</p>}
        {p.estimatedArrival && <p>Arrive: {formatTimestamp(String(p.estimatedArrival))}</p>}
        {p.estimatedDeparture && <p>Depart: {formatTimestamp(String(p.estimatedDeparture))}</p>}
      </div>
    </div>
  );
}

function DrivePopup({ p }: { p: SegmentPopupProps['properties'] }) {
  const hos = hosLabel(p.hosHoursDriven as number | null, p.hosCycleHoursUsed as number | null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Truck className="h-3.5 w-3.5 text-blue-300" />
        <Badge variant="outline" className="text-2xs px-1.5 py-0 text-blue-300 border-blue-600">
          DRIVE
        </Badge>
      </div>
      {(p.fromLocation || p.toLocation) && (
        <p className="font-medium text-sm text-foreground">
          {p.fromLocation ? String(p.fromLocation) : '?'} → {p.toLocation ? String(p.toLocation) : '?'}
        </p>
      )}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {p.distanceMiles != null && p.driveTimeHours != null && (
          <p>
            {Number(p.distanceMiles).toLocaleString(undefined, { maximumFractionDigits: 0 })} mi |{' '}
            {formatDuration(Number(p.driveTimeHours))}
          </p>
        )}
        {hos && <p>HOS: {hos}</p>}
      </div>
    </div>
  );
}

function BreakPopup({ p }: { p: SegmentPopupProps['properties'] }) {
  const hos = hosLabel(p.hosHoursDriven as number | null, p.hosCycleHoursUsed as number | null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Coffee className="h-3.5 w-3.5 text-slate-400" />
        <Badge variant="outline" className="text-2xs px-1.5 py-0 text-slate-400 border-slate-600">
          BREAK
        </Badge>
      </div>
      {p.name && <p className="font-medium text-sm text-foreground">{String(p.name)}</p>}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {p.restDurationHours != null && <p>{formatDuration(Number(p.restDurationHours))} break</p>}
        {p.restReason && <p className="italic">Reason: {String(p.restReason)}</p>}
        {hos && <p>HOS: {hos}</p>}
      </div>
    </div>
  );
}

function OriginDestPopup({ p }: { p: SegmentPopupProps['properties'] }) {
  const isOrigin = p.segmentType === 'origin';
  const Icon = isOrigin ? MapPin : Flag;
  const color = isOrigin ? 'text-info' : 'text-muted-foreground';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className={`font-medium text-sm ${color}`}>{isOrigin ? 'Origin' : 'Destination'}</span>
      </div>
      {p.name && <p className="text-xs text-muted-foreground">{String(p.name)}</p>}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SegmentPopup({ properties }: SegmentPopupProps) {
  const segType = String(properties.segmentType ?? '');

  return (
    <div className="min-w-[180px] max-w-[260px]">
      {segType === 'rest' && <RestPopup p={properties} />}
      {segType === 'fuel' && <FuelPopup p={properties} />}
      {segType === 'dock' && <DockPopup p={properties} />}
      {segType === 'drive' && <DrivePopup p={properties} />}
      {segType === 'break' && <BreakPopup p={properties} />}
      {(segType === 'origin' || segType === 'destination') && <OriginDestPopup p={properties} />}
    </div>
  );
}
