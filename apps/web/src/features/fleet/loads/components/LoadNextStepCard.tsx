'use client';

import { Button } from '@sally/ui/components/ui/button';
import { FileText, Send, DollarSign, Copy, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import type { LoadWithInvoices } from '@/features/fleet/loads/utils/load-invoice';
import { getLoadInvoice } from '@/features/fleet/loads/utils/load-invoice';
import type { BillingReadinessResult } from '@sally/shared-types';

interface LoadNextStepCardProps {
  load: LoadWithInvoices;
  billingReadiness?: BillingReadinessResult | null;
  onGenerateInvoice?: () => void;
  onSendReminder?: () => void;
  onRecordPayment?: () => void;
  onGoToFinancials?: () => void;
  onDuplicate?: () => void;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}

export function LoadNextStepCard({
  load,
  billingReadiness,
  onGenerateInvoice,
  onSendReminder,
  onRecordPayment,
  onGoToFinancials,
  onDuplicate,
}: LoadNextStepCardProps) {
  const invoice = getLoadInvoice(load);
  const isPaid = invoice?.status === 'PAID';

  // Only show for delivered, invoiced, or paid loads
  if (load.status !== 'DELIVERED' && !invoice) return null;

  // STATE: Paid / Complete
  if (isPaid) {
    const rateDollars = load.rateCents ? formatCurrency(load.rateCents) : null;
    return (
      <div className="py-4 border-b border-border bg-gradient-to-br from-muted/30 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Load Complete</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Fully settled.
          {rateDollars && (
            <>
              {' '}
              Revenue: <span className="font-medium text-foreground">${rateDollars}</span>
            </>
          )}
        </p>
        {onDuplicate && (
          <Button variant="outline" size="sm" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Duplicate Load
          </Button>
        )}
      </div>
    );
  }

  // STATE: Invoiced — Awaiting Payment
  if (invoice) {
    const totalDollars = invoice.totalCents ? formatCurrency(invoice.totalCents) : null;
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    return (
      <div className="py-4 border-b border-border bg-gradient-to-br from-caution/5 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-caution" />
          <span className="text-xs font-bold uppercase tracking-wide text-caution">Awaiting Payment</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Invoice {invoice.invoiceNumber ?? ''}
          {totalDollars && (
            <>
              {' '}
              for <span className="font-medium text-foreground">${totalDollars}</span>
            </>
          )}
          {dueDate && <> &middot; Due {dueDate}</>}
        </p>
        <div className="flex gap-2">
          {onRecordPayment && (
            <Button size="sm" onClick={onRecordPayment}>
              <DollarSign className="h-3.5 w-3.5 mr-1.5" />
              Record Payment
            </Button>
          )}
          {onSendReminder && (
            <Button variant="outline" size="sm" onClick={onSendReminder}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send Reminder
            </Button>
          )}
        </div>
      </div>
    );
  }

  // STATE: Delivered — Summary with link to Financials
  const readyToInvoice = billingReadiness?.readyToApprove ?? false;
  const score = billingReadiness?.score;
  const totalRequired = billingReadiness?.totalRequired ?? 0;
  const totalSatisfied = billingReadiness?.totalSatisfied ?? 0;

  // If billing readiness hasn't loaded yet, show a minimal card
  if (!billingReadiness) {
    return (
      <div className="py-4 border-b border-border bg-gradient-to-br from-muted/30 to-transparent">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Checking billing readiness...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 border-b border-border bg-gradient-to-br from-muted/30 to-transparent">
      <div className="flex items-center gap-2 mb-2">
        {readyToInvoice ? (
          <FileText className="h-4 w-4 text-muted-foreground" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-caution" />
        )}
        <span
          className={`text-xs font-bold uppercase tracking-wide ${readyToInvoice ? 'text-muted-foreground' : 'text-caution'}`}
        >
          {readyToInvoice ? 'Ready to Invoice' : 'Action Needed'}
        </span>
        {score !== undefined && (
          <span className="text-xs text-muted-foreground ml-auto">
            {totalSatisfied}/{totalRequired} items ready
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        {readyToInvoice
          ? 'All requirements satisfied — generate the invoice.'
          : `${totalRequired - totalSatisfied} item${totalRequired - totalSatisfied !== 1 ? 's' : ''} needed before invoicing.`}
      </p>

      <div className="flex gap-2">
        {readyToInvoice && onGenerateInvoice && (
          <Button size="sm" onClick={onGenerateInvoice}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Generate Invoice
          </Button>
        )}
        {!readyToInvoice && onGoToFinancials && (
          <Button size="sm" variant="outline" onClick={onGoToFinancials}>
            Review in Financials
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
