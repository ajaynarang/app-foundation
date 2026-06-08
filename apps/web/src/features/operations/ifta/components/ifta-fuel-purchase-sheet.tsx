'use client';

import { useState } from 'react';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { useCreateFuelPurchase } from '../hooks/use-ifta';
import { US_STATES } from '../constants';

interface IftaFuelPurchaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IftaFuelPurchaseSheet({ open, onOpenChange }: IftaFuelPurchaseSheetProps) {
  const createMutation = useCreateFuelPurchase();
  const today = new Date().toISOString().split('T')[0];
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [jurisdiction, setJurisdiction] = useState('');
  const [gallons, setGallons] = useState('');
  const [pricePerGallon, setPricePerGallon] = useState('');
  const [stationName, setStationName] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setPurchaseDate(today);
    setJurisdiction('');
    setGallons('');
    setPricePerGallon('');
    setStationName('');
    setNotes('');
  };

  const handleSubmit = () => {
    if (!purchaseDate || !jurisdiction || !gallons) return;

    createMutation.mutate(
      {
        purchaseDate,
        jurisdiction,
        gallons: parseFloat(gallons),
        pricePerGallon: pricePerGallon ? parseFloat(pricePerGallon) : undefined,
        stationName: stationName || undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  };

  const canSubmit = !!purchaseDate && !!jurisdiction && !!gallons && parseFloat(gallons) > 0;

  return (
    <FormSheet
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
      title="Record Fuel Stop"
      description="Log a fuel purchase — it's automatically assigned to the correct quarter."
      mode="edit"
      onSubmit={handleSubmit}
      submitLabel="Save Fuel Stop"
      isSubmitting={createMutation.isPending}
      submitDisabled={!canSubmit}
      pinnable
      resizable
    >
      <div className="space-y-4 px-0.5">
        <div className="space-y-2">
          <Label htmlFor="fp-date">Date</Label>
          <Input id="fp-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fp-state">State</Label>
          <Select value={jurisdiction} onValueChange={setJurisdiction}>
            <SelectTrigger id="fp-state">
              <SelectValue placeholder="Where did you fuel up?" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label} ({s.value})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="fp-gallons">Gallons</Label>
            <Input
              id="fp-gallons"
              type="number"
              min="0"
              step="0.1"
              value={gallons}
              onChange={(e) => setGallons(e.target.value)}
              placeholder="0.0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fp-price">$/Gallon</Label>
            <Input
              id="fp-price"
              type="number"
              min="0"
              step="0.01"
              value={pricePerGallon}
              onChange={(e) => setPricePerGallon(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fp-station">Station</Label>
          <Input
            id="fp-station"
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            placeholder="Pilot, Love's, TA..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fp-notes">Notes</Label>
          <Textarea
            id="fp-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={2}
          />
        </div>
      </div>
    </FormSheet>
  );
}
