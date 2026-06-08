'use client';

import { useCallback } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Label } from '@sally/ui/components/ui/label';
import { Separator } from '@sally/ui/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { SheetKeyboardHint } from '@sally/ui/components/ui/form-sheet';
import { useImportLoad } from '../hooks/use-import-load';
import type { LoadBoardListing } from '../types';

interface ImportLoadSheetProps {
  listing: LoadBoardListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ReviewField({ label, value }: { label: string; value: string | number | undefined }) {
  if (!value && value !== 0) return null;
  return (
    <div className="space-y-0.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

export function ImportLoadSheet({ listing, open, onOpenChange }: ImportLoadSheetProps) {
  const importLoad = useImportLoad();

  const handleImport = useCallback(() => {
    if (!listing) return;
    importLoad.mutate(
      { externalId: listing.externalId, provider: listing.provider },
      { onSuccess: () => onOpenChange(false) },
    );
  }, [listing, importLoad, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleImport();
      }
    },
    [handleImport],
  );

  if (!listing) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        pinnable
        resizable
        defaultPinned
      >
        <SheetHeader className="p-6 pb-0">
          <SheetTitle>Import Load from DAT</SheetTitle>
          <SheetDescription>Review load details before importing as a draft</SheetDescription>
        </SheetHeader>

        <div className="p-6 space-y-4" onKeyDown={handleKeyDown} tabIndex={-1}>
          {/* Route */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Route</Label>
            <div className="mt-1 text-sm text-foreground">
              {listing.origin.city}, {listing.origin.state} {listing.origin.zipCode || ''} → {listing.destination.city},{' '}
              {listing.destination.state} {listing.destination.zipCode || ''}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ReviewField label="Rate" value={`$${listing.rate.toLocaleString()}`} />
            <ReviewField label="Rate/Mile" value={`$${listing.ratePerMile.toFixed(2)}/mi`} />
            <ReviewField label="Equipment" value={listing.equipmentType} />
            <ReviewField label="Weight" value={listing.weight ? `${listing.weight.toLocaleString()} lbs` : undefined} />
            <ReviewField label="Distance" value={`${listing.distance.toLocaleString()} mi`} />
            <ReviewField label="Deadhead" value={listing.deadheadMiles ? `${listing.deadheadMiles} mi` : undefined} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <ReviewField
              label="Pickup"
              value={new Date(listing.pickupDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            />
            {listing.deliveryDate && (
              <ReviewField
                label="Delivery"
                value={new Date(listing.deliveryDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              />
            )}
            <ReviewField label="Commodity" value={listing.commodity} />
            <ReviewField label="Reference #" value={listing.referenceNumber} />
          </div>

          <Separator />

          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Broker</Label>
            <div className="mt-1 grid grid-cols-2 gap-4">
              <ReviewField label="Company" value={listing.broker.name} />
              <ReviewField label="MC Number" value={listing.broker.mcNumber} />
              <ReviewField label="Phone" value={listing.broker.phone} />
              <ReviewField label="Contact" value={listing.broker.contact} />
            </div>
          </div>

          {listing.specialInstructions && (
            <>
              <Separator />
              <ReviewField label="Special Instructions" value={listing.specialInstructions} />
            </>
          )}

          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Load Number</div>
            <div className="text-sm text-muted-foreground italic">Auto-generated on import</div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <SheetKeyboardHint />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} loading={importLoad.isPending}>
                Import as Draft
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
