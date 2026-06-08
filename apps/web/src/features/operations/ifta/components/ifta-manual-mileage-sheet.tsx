'use client';

import { useState } from 'react';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { useAddManualMileage } from '../hooks/use-ifta';
import { US_STATES } from '../constants';

interface IftaManualMileageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const currentYear = new Date().getFullYear();
const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
const yearOptions = Array.from({ length: 3 }, (_, i) => currentYear - i);

export function IftaManualMileageSheet({ open, onOpenChange }: IftaManualMileageSheetProps) {
  const addMileageMutation = useAddManualMileage();
  const [jurisdiction, setJurisdiction] = useState('');
  const [miles, setMiles] = useState('');
  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState(String(currentQuarter));
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setJurisdiction('');
    setMiles('');
    setYear(String(currentYear));
    setQuarter(String(currentQuarter));
    setNotes('');
  };

  const handleSubmit = () => {
    if (!jurisdiction || !miles) return;

    addMileageMutation.mutate(
      {
        jurisdiction,
        totalMiles: parseFloat(miles),
        year: parseInt(year, 10),
        quarter: parseInt(quarter, 10),
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

  const canSubmit = !!jurisdiction && !!miles && parseFloat(miles) > 0;

  return (
    <FormSheet
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
      title="Record State Mileage"
      description="Manually enter miles driven in a specific state for a quarter."
      mode="edit"
      onSubmit={handleSubmit}
      submitLabel="Save Mileage"
      isSubmitting={addMileageMutation.isPending}
      submitDisabled={!canSubmit}
      pinnable
      resizable
    >
      <div className="space-y-4 px-0.5">
        <div className="space-y-2">
          <Label htmlFor="mm-state">State</Label>
          <Select value={jurisdiction} onValueChange={setJurisdiction}>
            <SelectTrigger id="mm-state">
              <SelectValue placeholder="Which state?" />
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

        <div className="space-y-2">
          <Label htmlFor="mm-miles">Miles</Label>
          <Input
            id="mm-miles"
            type="number"
            min="0"
            step="1"
            value={miles}
            onChange={(e) => setMiles(e.target.value)}
            placeholder="Total miles in this state"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="mm-year">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger id="mm-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mm-quarter">Quarter</Label>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger id="mm-quarter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((q) => (
                  <SelectItem key={q} value={String(q)}>
                    Q{q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mm-notes">Notes</Label>
          <Textarea
            id="mm-notes"
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
