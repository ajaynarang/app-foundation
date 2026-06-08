'use client';

import { useEffect, useState } from 'react';

import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Textarea } from '@app/ui/components/ui/textarea';

import { useAiBudget, useUpdateAiBudget } from '../hooks';
import type { AiSpendTenantSummary } from '../types';

interface AiBudgetSheetProps {
  tenant: AiSpendTenantSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  dailySoftUsd: string;
  dailyHardUsd: string;
  monthlySoftUsd: string;
  monthlyHardUsd: string;
  notes: string;
}

const EMPTY: FormState = {
  dailySoftUsd: '',
  dailyHardUsd: '',
  monthlySoftUsd: '',
  monthlyHardUsd: '',
  notes: '',
};

/**
 * Edit a tenant's AI cost budget. 5 fields → Sheet (per Sally rules), edit
 * mode (blocks outside click). Client-side validates the same invariants the
 * server enforces (≥0, hard ≥ soft, monthly ≥ daily) so the operator gets
 * inline feedback before the round-trip.
 */
export function AiBudgetSheet({ tenant, open, onOpenChange }: AiBudgetSheetProps) {
  const tenantId = tenant?.tenantId ?? null;
  const { data: budget } = useAiBudget(tenantId, open);
  const updateMutation = useUpdateAiBudget(tenantId ?? 0);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the form from the fetched budget whenever it loads / changes.
  useEffect(() => {
    if (budget) {
      setForm({
        dailySoftUsd: budget.dailySoftUsd,
        dailyHardUsd: budget.dailyHardUsd,
        monthlySoftUsd: budget.monthlySoftUsd,
        monthlyHardUsd: budget.monthlyHardUsd,
        notes: budget.notes ?? '',
      });
    }
  }, [budget]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = () => {
    const dailySoftUsd = Number(form.dailySoftUsd);
    const dailyHardUsd = Number(form.dailyHardUsd);
    const monthlySoftUsd = Number(form.monthlySoftUsd);
    const monthlyHardUsd = Number(form.monthlyHardUsd);

    if ([dailySoftUsd, dailyHardUsd, monthlySoftUsd, monthlyHardUsd].some((n) => !Number.isFinite(n) || n < 0)) {
      setError('All caps must be non-negative numbers.');
      return;
    }
    if (dailyHardUsd < dailySoftUsd) {
      setError('Daily hard cap must be ≥ daily soft cap.');
      return;
    }
    if (monthlyHardUsd < monthlySoftUsd) {
      setError('Monthly hard cap must be ≥ monthly soft cap.');
      return;
    }
    if (monthlyHardUsd < dailyHardUsd) {
      setError('Monthly hard cap must be ≥ daily hard cap.');
      return;
    }
    setError(null);

    updateMutation.mutate(
      { dailySoftUsd, dailyHardUsd, monthlySoftUsd, monthlyHardUsd, notes: form.notes.trim() || null },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Budget — ${tenant?.companyName ?? ''}`}
      mode="edit"
      onSubmit={handleSubmit}
      isSubmitting={updateMutation.isPending}
      pinnable
      resizable
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Caps the tenant&apos;s actual AI cost in USD. Soft shows a banner; hard blocks new AI calls. Separate from
          plan quota (which counts feature uses).
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="dailySoftUsd">Daily soft ($)</Label>
            <Input
              id="dailySoftUsd"
              type="number"
              step="0.01"
              min="0"
              value={form.dailySoftUsd}
              onChange={set('dailySoftUsd')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dailyHardUsd">Daily hard ($)</Label>
            <Input
              id="dailyHardUsd"
              type="number"
              step="0.01"
              min="0"
              value={form.dailyHardUsd}
              onChange={set('dailyHardUsd')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="monthlySoftUsd">Monthly soft ($)</Label>
            <Input
              id="monthlySoftUsd"
              type="number"
              step="0.01"
              min="0"
              value={form.monthlySoftUsd}
              onChange={set('monthlySoftUsd')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="monthlyHardUsd">Monthly hard ($)</Label>
            <Input
              id="monthlyHardUsd"
              type="number"
              step="0.01"
              min="0"
              value={form.monthlyHardUsd}
              onChange={set('monthlyHardUsd')}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" rows={2} value={form.notes} onChange={set('notes')} placeholder="Why these caps?" />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </FormSheet>
  );
}
