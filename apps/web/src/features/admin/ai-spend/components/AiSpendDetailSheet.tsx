'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';

import { AiSpendSurfaceBreakdown } from './AiSpendSurfaceBreakdown';
import { AiSpendInvocationList } from './AiSpendInvocationList';
import { AiCostVsQuotaPanel } from './AiCostVsQuotaPanel';
import { AiBudgetSheet } from './AiBudgetSheet';
import type { AiSpendTenantSummary } from '../types';

interface AiSpendDetailSheetProps {
  tenant: AiSpendTenantSummary | null;
  days: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * View-only drill-in for one tenant's AI spend. Per Sally sheet rules this
 * is a detail view (not an edit form), so everything closes it. Cost-vs-quota
 * panel on top, then the per-surface breakdown and the invocation list. An
 * "Edit budget" action opens a separate edit Sheet (FormSheet).
 */
export function AiSpendDetailSheet({ tenant, days, open, onOpenChange }: AiSpendDetailSheetProps) {
  const [budgetOpen, setBudgetOpen] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent pinnable resizable className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader
            actions={
              <Button variant="outline" size="sm" onClick={() => setBudgetOpen(true)}>
                <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                Edit budget
              </Button>
            }
          >
            <SheetTitle>{tenant?.companyName ?? 'AI Spend'}</SheetTitle>
            <SheetDescription>Where this account&apos;s AI cost is going — last {days} days</SheetDescription>
          </SheetHeader>

          {tenant && (
            <div className="mt-6 space-y-8">
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Cost vs quota</h3>
                <AiCostVsQuotaPanel tenantId={tenant.tenantId} days={days} />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">By surface</h3>
                <AiSpendSurfaceBreakdown tenantId={tenant.tenantId} days={days} />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Recent invocations</h3>
                <AiSpendInvocationList tenantId={tenant.tenantId} />
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AiBudgetSheet tenant={tenant} open={budgetOpen} onOpenChange={setBudgetOpen} />
    </>
  );
}
