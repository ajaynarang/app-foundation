'use client';

import {
  MapPin,
  Phone,
  Mail,
  Building2,
  Clock,
  Truck,
  Weight,
  Route,
  ArrowRight,
  TrendingUp,
  Calendar,
  Hash,
  FileText,
  Ruler,
  PhoneCall,
  Download,
} from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Separator } from '@sally/ui/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import type { LoadBoardListing } from '../types';

interface LoadBoardDetailSheetProps {
  listing: LoadBoardListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: () => void;
  isImporting: boolean;
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

const PHONE_PATTERN = /^[\d\s()+\-\.]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoadBoardDetailSheet({
  listing,
  open,
  onOpenChange,
  onImport,
  isImporting,
}: LoadBoardDetailSheetProps) {
  const sizing = useSheetSizing('load-board');

  if (!listing) return null;

  const {
    origin,
    destination,
    rate,
    ratePerMile,
    distance,
    deadheadMiles,
    equipmentType,
    weight,
    pickupDate,
    deliveryDate,
    broker,
    commodity,
    specialInstructions,
    referenceNumber,
    postedAt,
    length,
  } = listing;

  const isValidPhone = broker.phone ? PHONE_PATTERN.test(broker.phone) : false;
  const isValidEmail = broker.email ? EMAIL_PATTERN.test(broker.email) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 flex flex-col"
        pinnable
        resizable
        defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
      >
        <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="load-board" /> : undefined}>
          <SheetTitle className="text-base">
            <div className="flex items-center gap-2">
              <span>
                {origin.city}, {origin.state}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span>
                {destination.city}, {destination.state}
              </span>
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Load board listing details for {origin.city}, {origin.state} to {destination.city}, {destination.state}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-0">
            {/* Rate hero */}
            <div className="pb-3 flex items-center gap-3">
              <span className="text-2xl font-bold text-foreground">${rate.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">${ratePerMile.toFixed(2)}/mi</span>
              <Badge variant="muted" className="ml-auto">
                {equipmentType}
              </Badge>
            </div>
            {/* Lane Intelligence — SALLY's value-add, shown first */}
            <div className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Lane Intelligence
                </span>
              </div>
              {listing.laneInsight ? (
                <div className="space-y-1">
                  <div className="text-sm text-foreground">
                    Your average:{' '}
                    <span className="font-medium">${listing.laneInsight.avgRatePerMile.toFixed(2)}/mi</span>
                    <span className="text-muted-foreground text-xs ml-1">
                      ({listing.laneInsight.loadCount} loads, 90 days)
                    </span>
                  </div>
                  <div
                    className={cn(
                      'text-sm font-medium',
                      listing.laneInsight.verdict === 'above_market' && 'text-green-400',
                      listing.laneInsight.verdict === 'market_rate' && 'text-muted-foreground',
                      listing.laneInsight.verdict === 'below_market' && 'text-yellow-400',
                    )}
                  >
                    This listing: ${ratePerMile.toFixed(2)}/mi — {listing.laneInsight.percentDiff > 0 ? '+' : ''}
                    {listing.laneInsight.percentDiff}% vs your average
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No historical data for this lane yet. Import loads on this route to see rate comparisons.
                </p>
              )}
            </div>

            {/* Route */}
            <SectionHeader>Route</SectionHeader>
            <div className="grid grid-cols-2 gap-x-4">
              <DetailRow label="Distance" value={`${distance.toLocaleString()} mi`} icon={Route} />
              {deadheadMiles != null && <DetailRow label="Deadhead" value={`${deadheadMiles} mi`} icon={MapPin} />}
            </div>

            {/* Load Details */}
            <SectionHeader>Load Details</SectionHeader>
            <div className="grid grid-cols-2 gap-x-4">
              <DetailRow label="Equipment" value={equipmentType} icon={Truck} />
              {weight && <DetailRow label="Weight" value={`${weight.toLocaleString()} lbs`} icon={Weight} />}
              {commodity && <DetailRow label="Commodity" value={commodity} icon={FileText} />}
              {length && <DetailRow label="Length" value={`${length} ft`} icon={Ruler} />}
            </div>

            {/* Dates */}
            <SectionHeader>Schedule</SectionHeader>
            <div className="grid grid-cols-2 gap-x-4">
              <DetailRow
                label="Pickup"
                value={new Date(pickupDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                icon={Calendar}
              />
              {deliveryDate && (
                <DetailRow
                  label="Delivery"
                  value={new Date(deliveryDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  icon={Clock}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              {referenceNumber && <DetailRow label="Reference" value={referenceNumber} icon={Hash} />}
              <DetailRow label="Posted" value={formatRelativeTime(postedAt)} />
            </div>

            {/* Broker */}
            <SectionHeader>Broker</SectionHeader>
            <DetailRow label="Company" value={broker.name} icon={Building2} />
            <div className="grid grid-cols-2 gap-x-4">
              {broker.contact && <DetailRow label="Contact" value={broker.contact} />}
              {broker.phone && (
                <DetailRow
                  label="Phone"
                  value={
                    isValidPhone ? (
                      <a href={`tel:${broker.phone}`} className="text-primary hover:underline">
                        {broker.phone}
                      </a>
                    ) : (
                      broker.phone
                    )
                  }
                  icon={Phone}
                />
              )}
            </div>
            {broker.email && (
              <DetailRow
                label="Email"
                value={
                  isValidEmail ? (
                    <a href={`mailto:${broker.email}`} className="text-primary hover:underline">
                      {broker.email}
                    </a>
                  ) : (
                    broker.email
                  )
                }
                icon={Mail}
              />
            )}
            {broker.mcNumber && <DetailRow label="MC Number" value={broker.mcNumber} />}

            {/* Special Instructions */}
            {specialInstructions && (
              <>
                <SectionHeader>Special Instructions</SectionHeader>
                <p className="text-sm text-muted-foreground">{specialInstructions}</p>
              </>
            )}
          </div>
        </div>

        {/* Sticky footer — CTAs */}
        <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
          {broker.phone && isValidPhone && (
            <Button variant="default" className="flex-1" onClick={() => window.open(`tel:${broker.phone}`)}>
              <PhoneCall className="mr-2 h-4 w-4" />
              Call Broker
            </Button>
          )}
          <Button
            variant="outline"
            className={broker.phone && isValidPhone ? 'flex-1' : 'w-full'}
            onClick={onImport}
            loading={isImporting}
          >
            <Download className="mr-2 h-4 w-4" />
            Save as Draft
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
