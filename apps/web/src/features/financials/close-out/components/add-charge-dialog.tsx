'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { useAddCharge } from '@/features/fleet/loads/hooks/use-loads';

const CHARGE_TYPES = [
  { value: 'detention_pickup', label: 'Detention (Pickup)' },
  { value: 'detention_delivery', label: 'Detention (Delivery)' },
  { value: 'lumper', label: 'Lumper' },
  { value: 'layover', label: 'Layover' },
  { value: 'fuel_surcharge', label: 'Fuel Surcharge' },
  { value: 'accessorial', label: 'Accessorial' },
  { value: 'tonu', label: 'TONU' },
  { value: 'adjustment', label: 'Adjustment' },
];

interface Props {
  loadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddChargeDialog({ loadId, open, onOpenChange }: Props) {
  const addCharge = useAddCharge();
  const [chargeType, setChargeType] = useState('detention_pickup');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents <= 0) return;

    const label = CHARGE_TYPES.find((t) => t.value === chargeType)?.label ?? chargeType;
    addCharge.mutate(
      {
        loadId,
        data: {
          chargeType: chargeType,
          description: note.trim() || label,
          quantity: 1,
          unitPriceCents: cents,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setChargeType('detention_pickup');
          setAmount('');
          setNote('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Charge</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={chargeType} onValueChange={setChargeType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHARGE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Amount ($)</Label>
            <Input
              className="mt-1"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Textarea
              className="mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., 3 hours wait at dock"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={addCharge.isPending} disabled={!amount}>
            Add Charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
