'use client';

import { useEffect, useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { US_STATES } from '@/features/operations/ifta/constants';
import { useLogFuel } from '../hooks/use-fuel-log';
import type { FuelReceiptExtraction } from '@sally/shared-types';

interface FuelLogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillData?: Partial<FuelReceiptExtraction>;
  source?: 'MANUAL' | 'RECEIPT_SCAN';
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function FuelLogForm({ open, onOpenChange, prefillData, source = 'MANUAL' }: FuelLogFormProps) {
  const { mutate: logFuel, isPending } = useLogFuel();

  const [purchaseDate, setPurchaseDate] = useState(prefillData?.purchaseDate || getTodayDate());
  const [jurisdiction, setJurisdiction] = useState(prefillData?.state || '');
  const [gallons, setGallons] = useState(prefillData?.gallons != null ? String(prefillData.gallons) : '');
  const [pricePerGallon, setPricePerGallon] = useState(
    prefillData?.pricePerGallon != null ? String(prefillData.pricePerGallon) : '',
  );
  const [stationName, setStationName] = useState(prefillData?.vendorName || '');

  // Sync prefillData into state when it changes (e.g. after receipt scan completes
  // while the sheet is already mounted).
  useEffect(() => {
    if (prefillData) {
      setPurchaseDate(prefillData.purchaseDate || getTodayDate());
      setJurisdiction(prefillData.state || '');
      setGallons(prefillData.gallons != null ? String(prefillData.gallons) : '');
      setPricePerGallon(prefillData.pricePerGallon != null ? String(prefillData.pricePerGallon) : '');
      setStationName(prefillData.vendorName || '');
    }
  }, [prefillData]);

  function resetForm() {
    setPurchaseDate(prefillData?.purchaseDate || getTodayDate());
    setJurisdiction(prefillData?.state || '');
    setGallons(prefillData?.gallons != null ? String(prefillData.gallons) : '');
    setPricePerGallon(prefillData?.pricePerGallon != null ? String(prefillData.pricePerGallon) : '');
    setStationName(prefillData?.vendorName || '');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  function handleSubmit() {
    const parsedGallons = parseFloat(gallons);
    if (!purchaseDate || !jurisdiction || !parsedGallons || parsedGallons <= 0) return;

    const payload = {
      purchaseDate,
      jurisdiction,
      gallons: parsedGallons,
      ...(pricePerGallon ? { pricePerGallon: parseFloat(pricePerGallon) } : {}),
      ...(stationName.trim() ? { stationName: stationName.trim() } : {}),
      source,
    };

    logFuel(payload, {
      onSuccess: () => handleOpenChange(false),
    });
  }

  const isValid = !!purchaseDate && !!jurisdiction && !!gallons && parseFloat(gallons) > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col rounded-t-2xl max-h-[90dvh] pb-safe"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="flex-shrink-0 pb-2">
          <SheetTitle>{source === 'RECEIPT_SCAN' ? 'Confirm Fuel Purchase' : 'Log Fuel Purchase'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pt-2 px-1 pb-2">
          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="fuel-date">Purchase Date</Label>
            <Input
              id="fuel-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="h-11"
            />
          </div>

          {/* State / Jurisdiction */}
          <div className="space-y-1.5">
            <Label htmlFor="fuel-state">State</Label>
            <Select value={jurisdiction} onValueChange={setJurisdiction}>
              <SelectTrigger id="fuel-state" className="h-11">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gallons */}
          <div className="space-y-1.5">
            <Label htmlFor="fuel-gallons">Gallons</Label>
            <Input
              id="fuel-gallons"
              type="number"
              inputMode="decimal"
              placeholder="0.000"
              value={gallons}
              onChange={(e) => setGallons(e.target.value)}
              className="h-11 text-lg font-semibold"
              min="0"
              step="0.001"
            />
          </div>

          {/* Price per gallon — optional */}
          <div className="space-y-1.5">
            <Label htmlFor="fuel-price">
              Price per Gallon <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="fuel-price"
              type="number"
              inputMode="decimal"
              placeholder="$0.000"
              value={pricePerGallon}
              onChange={(e) => setPricePerGallon(e.target.value)}
              className="h-11"
              min="0"
              step="0.001"
            />
          </div>

          {/* Station name — optional */}
          <div className="space-y-1.5">
            <Label htmlFor="fuel-station">
              Station Name <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="fuel-station"
              type="text"
              placeholder="e.g. Pilot Flying J"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              className="h-11"
            />
          </div>
        </div>

        {/* Sticky submit footer */}
        <div className="flex-shrink-0 pt-4 border-t border-border space-y-2">
          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleSubmit}
            disabled={!isValid}
            loading={isPending}
          >
            {source === 'RECEIPT_SCAN' ? 'Confirm & Save' : 'Log Fuel'}
          </Button>
          <Button variant="ghost" className="w-full h-11" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
