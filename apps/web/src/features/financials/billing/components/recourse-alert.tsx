'use client';

import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import type { Invoice } from '../types';

interface RecourseAlertProps {
  invoices: Invoice[];
  onOpenInvoice: (invoiceId: string) => void;
}

/**
 * Phase 4 — banner that surfaces RECOURSED invoices on the billing page top.
 * Renders nothing when no invoices are in recourse. Pulls from the existing
 * invoice list query — no new fetches.
 */
export function RecourseAlert({ invoices, onOpenInvoice }: RecourseAlertProps) {
  const { formatCents } = useFormatters();
  const recoursed = invoices.filter((inv) => inv.status === 'RECOURSED');
  if (recoursed.length === 0) return null;

  const totalAtRisk = recoursed.reduce((sum, inv) => sum + (inv.advanceAmountCents ?? 0), 0);

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-red-500/40 bg-red-500/5 p-4 dark:bg-red-950/20 sm:flex-row sm:items-center"
      role="alert"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {recoursed.length} invoice{recoursed.length === 1 ? '' : 's'} in recourse —{' '}
            <span className="text-red-500 dark:text-red-400">{formatCents(totalAtRisk)}</span> at risk
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Factor charged back the advance. Chase broker payment, or record a chargeback reversal once funds clear.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {recoursed.slice(0, 3).map((inv) => (
          <Button
            key={inv.invoiceNumber}
            size="sm"
            variant="outline"
            className="gap-1 border-red-500/40 hover:bg-red-500/10"
            onClick={() => onOpenInvoice(inv.invoiceNumber)}
          >
            {inv.invoiceNumber}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ))}
        {recoursed.length > 3 && (
          <span className="self-center text-xs text-muted-foreground">+{recoursed.length - 3} more</span>
        )}
      </div>
    </div>
  );
}
