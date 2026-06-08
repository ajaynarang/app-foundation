'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { useAddDeduction } from '../hooks/use-settlements';

interface AddDeductionDialogProps {
  settlementId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDeductionDialog({ settlementId, open, onOpenChange }: AddDeductionDialogProps) {
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const addDeduction = useAddDeduction();

  const handleSubmit = () => {
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!type || !description.trim() || isNaN(amountCents) || amountCents <= 0) return;

    addDeduction.mutate(
      {
        settlementId,
        data: {
          type,
          description: description.trim(),
          amountCents,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setType('');
          setDescription('');
          setAmount('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Deduction</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="deduction-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="deduction-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FUEL_ADVANCE">Fuel Advance</SelectItem>
                <SelectItem value="CASH_ADVANCE">Cash Advance</SelectItem>
                <SelectItem value="INSURANCE">Insurance</SelectItem>
                <SelectItem value="EQUIPMENT_LEASE">Equipment Lease</SelectItem>
                <SelectItem value="ESCROW">Escrow</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deduction-desc">Description</Label>
            <Input
              id="deduction-desc"
              placeholder="e.g. Fuel advance - 02/10"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deduction-amount">Amount ($)</Label>
            <Input
              id="deduction-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            loading={addDeduction.isPending}
            disabled={!type || !description.trim() || !amount}
          >
            Add Deduction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
