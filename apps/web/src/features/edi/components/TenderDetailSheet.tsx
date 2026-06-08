'use client';

import { useMemo } from 'react';
import { formatLoadLabel } from '@sally/shared-types';
import { MapPin, Building2, Clock, Truck, ArrowRight, Hash, Ruler } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Separator } from '@sally/ui/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { formatRelativeTime, formatCents } from '@/shared/lib/utils/formatters';
import { useRespondToTender } from '../hooks/use-edi';
import { useCountdown } from '../hooks/use-countdown';
import { getRateColor, deriveTenderRoute, computeRatePerMile } from '../lib/tender-utils';
import type { EDITender } from '../types';

interface TenderDetailSheetProps {
  tender: EDITender | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      {Icon && <Icon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Separator className="my-3" />
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{children}</div>
    </>
  );
}

export function TenderDetailSheet({ tender, open, onOpenChange }: TenderDetailSheetProps) {
  const respond = useRespondToTender();
  const sizing = useSheetSizing('tender');
  const { urgency } = useCountdown(tender?.expiresAt ?? null);

  const derived = useMemo(() => {
    if (!tender) return null;

    const brokerName = tender.parsedData?.brokerName ?? tender.tradingPartner?.name ?? 'Unknown';
    const rateCents = tender.parsedData?.rateCents ?? tender.load?.rateCents ?? null;
    const miles = tender.load?.estimatedMiles ?? null;
    const equipmentType = tender.parsedData?.equipmentType ?? tender.load?.requiredEquipmentType ?? null;

    const route = deriveTenderRoute(tender);
    const rpm = computeRatePerMile(tender);
    const ratePerMile = rateCents && miles && miles > 0 ? (rateCents / 100 / miles).toFixed(2) : null;
    const rateColor = rpm > 0 ? getRateColor(rpm) : 'text-muted-foreground';

    const loadId = tender.load?.id;
    const canRespond = !!loadId;
    const stops = tender.parsedData?.stops ?? [];

    return {
      brokerName,
      rateCents,
      miles,
      equipmentType,
      origin: route.origin,
      destination: route.destination,
      ratePerMile,
      rateColor,
      loadId,
      canRespond,
      stops,
    };
  }, [tender]);

  if (!tender || !derived) return null;

  const {
    brokerName,
    rateCents,
    miles,
    equipmentType,
    origin,
    destination,
    ratePerMile,
    rateColor,
    loadId,
    canRespond,
    stops,
  } = derived;

  const isExpired = urgency === 'expired';

  const handleAccept = () => {
    if (!loadId) return;
    respond.mutate({ loadId, data: { response: 'accept' } }, { onSuccess: () => onOpenChange(false) });
  };

  const handleDecline = () => {
    if (!loadId) return;
    respond.mutate({ loadId, data: { response: 'decline' } }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 flex flex-col"
        pinnable
        resizable
        defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="tender" /> : undefined}>
          <SheetTitle className="text-base">
            <div className="flex items-center gap-2">
              {origin && <span>{origin}</span>}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              {destination && <span>{destination}</span>}
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Tender details for {origin} to {destination}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Rate hero */}
            <div className="flex items-center gap-3">
              {rateCents != null && (
                <span className={cn('text-2xl font-bold', rateColor)}>{formatCents(rateCents)}</span>
              )}
              {ratePerMile && <span className={cn('text-sm', rateColor)}>${ratePerMile}/mi</span>}
              {equipmentType && (
                <Badge variant="muted" className="ml-auto">
                  {equipmentType}
                </Badge>
              )}
            </div>
            {/* Overview */}
            <SectionHeader>Overview</SectionHeader>
            <DetailRow label="Broker" value={brokerName} icon={Building2} />
            {tender.referenceNumber && <DetailRow label="Reference" value={tender.referenceNumber} icon={Hash} />}
            <div className="grid grid-cols-2 gap-x-4">
              {equipmentType && <DetailRow label="Equipment" value={equipmentType} icon={Truck} />}
              {miles != null && <DetailRow label="Distance" value={`${miles.toLocaleString()} mi`} icon={Ruler} />}
            </div>
            {tender.expiresAt && (
              <DetailRow
                label="Expires"
                value={
                  <span
                    className={cn(
                      urgency === 'expired' && 'text-red-400',
                      urgency === 'critical' && 'text-red-400',
                      urgency === 'warning' && 'text-amber-400',
                    )}
                  >
                    {new Date(tender.expiresAt).toLocaleString()}
                  </span>
                }
                icon={Clock}
              />
            )}

            {/* Stops */}
            {stops.length > 0 && (
              <>
                <SectionHeader>Route</SectionHeader>
                <div className="space-y-2">
                  {stops.map((stop, idx) => (
                    <div key={idx} className="flex items-start gap-3 py-1.5">
                      <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground capitalize">
                          {stop.actionType || (idx === 0 ? 'Pickup' : 'Delivery')}
                        </div>
                        <div className="text-sm text-foreground">
                          {stop.city}, {stop.state}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Rate Analysis */}
            {rateCents != null && (
              <>
                <SectionHeader>Rate Analysis</SectionHeader>
                <div className="grid grid-cols-2 gap-x-4">
                  <DetailRow label="Total Rate" value={formatCents(rateCents)} />
                  {ratePerMile && <DetailRow label="Rate per Mile" value={`$${ratePerMile}/mi`} />}
                </div>
              </>
            )}

            {/* Metadata */}
            <SectionHeader>Details</SectionHeader>
            <DetailRow label="Message Type" value={tender.messageType} />
            <DetailRow label="Posted" value={formatRelativeTime(tender.createdAt)} />
            {tender.load?.loadNumber && (
              <DetailRow
                label="Load Number"
                value={formatLoadLabel(tender.load.loadNumber, tender.load.referenceNumber)}
              />
            )}
          </div>
        </div>

        {/* Sticky footer — Accept / Reject */}
        <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
          <Button
            className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isExpired || !canRespond}
            loading={respond.isPending && respond.variables?.data.response === 'accept'}
            onClick={handleAccept}
          >
            Accept
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-h-[44px]"
            disabled={isExpired || !canRespond}
            loading={respond.isPending && respond.variables?.data.response === 'decline'}
            onClick={handleDecline}
          >
            Decline
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
