'use client';

import { useEffect, useState } from 'react';

import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';

import { useResponsibility, useResponsibilityUISpec, useUpdateResponsibility } from '../../hooks/use-responsibilities';

import { ConditionsForm } from './tabs/conditions-form';

interface ResponsibilityRulesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  responsibilityKey: string;
  responsibilityTitle: string;
  readOnly?: boolean;
}

/**
 * Focused edit surface for a responsibility's hard rules. The briefing
 * card shows a one-line summary; clicking "Edit rules" opens this sheet
 * with its own dirty state + Save button. Completely separate from the
 * agent sheet's batched Save so rule edits are a scoped commit.
 */
export function ResponsibilityRulesSheet({
  open,
  onOpenChange,
  responsibilityKey,
  responsibilityTitle,
  readOnly = false,
}: ResponsibilityRulesSheetProps) {
  const detail = useResponsibility(open ? responsibilityKey : '');
  const uiSpec = useResponsibilityUISpec(open ? responsibilityKey : '');
  const update = useUpdateResponsibility();

  const serverValue = (detail.data?.conditions as Record<string, unknown> | undefined) ?? {};
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);

  // Reset local draft whenever the sheet opens fresh or the key changes
  useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  const effective = draft ?? serverValue;
  const isDirty = draft !== null;

  const handleSubmit = async () => {
    if (!isDirty || readOnly) return;
    try {
      await update.mutateAsync({ key: responsibilityKey, patch: { conditions: effective } });
      onOpenChange(false);
    } catch {
      // update hook already fires error toast
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit rules · ${responsibilityTitle}`}
      mode={readOnly ? 'view' : 'edit'}
      onSubmit={readOnly ? undefined : handleSubmit}
      submitLabel="Save rules"
      cancelLabel="Cancel"
      submitDisabled={!isDirty || update.isPending}
      isSubmitting={update.isPending}
      pinnable
      resizable
    >
      {detail.isLoading || uiSpec.isLoading || !uiSpec.data?.conditionsUI ? (
        <RulesSheetSkeleton />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These rules run before Sally acts. They are the line between &quot;auto&quot; and &quot;ask for
            approval.&quot;
          </p>
          <ConditionsForm
            spec={uiSpec.data.conditionsUI}
            value={effective}
            onChange={(next) => setDraft(next)}
            disabled={readOnly}
          />
        </div>
      )}
    </FormSheet>
  );
}

function RulesSheetSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
