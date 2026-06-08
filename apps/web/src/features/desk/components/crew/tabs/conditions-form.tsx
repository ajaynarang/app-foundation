'use client';

import { Info } from 'lucide-react';

import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { cn } from '@/shared/lib/utils';

import type { ConditionFieldSpec, ConditionsUISpec } from '../../../types';

interface ConditionsFormProps {
  spec: ConditionsUISpec;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Renders a responsibility's "hard rules" form from its ConditionsUISpec
 * — currency / number / checkbox / customer-multiselect fields. Every
 * change fires `onChange` with the next full value so the parent's dirty
 * state batches saves with the rest of the sheet. No inline save button —
 * the sheet's sticky footer owns all saves.
 */
export function ConditionsForm({ spec, value, onChange, disabled }: ConditionsFormProps) {
  const setField = (key: string, next: unknown) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="space-y-3">
      {spec.fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={(v) => setField(field.key, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ConditionFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  if (field.control === 'currency' || field.control === 'number') {
    const num = typeof value === 'number' ? value : undefined;
    const isCurrency = field.control === 'currency';
    return (
      <div className="space-y-1.5">
        <Label htmlFor={field.key} className="text-sm font-medium">
          {field.label}
        </Label>
        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        <div className={cn('relative', !isCurrency && 'max-w-[200px]')}>
          {isCurrency && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            >
              $
            </span>
          )}
          <Input
            id={field.key}
            type="number"
            value={num ?? ''}
            min={field.min}
            max={field.max}
            placeholder={isCurrency ? field.placeholder : undefined}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v === '' ? undefined : Number(v));
            }}
            className={cn('max-w-[240px]', isCurrency && 'pl-7')}
          />
        </div>
      </div>
    );
  }

  if (field.control === 'checkbox') {
    const checked = value === true;
    return (
      <div className="flex items-start gap-2">
        <Checkbox
          id={field.key}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(c) => onChange(c === true)}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor={field.key} className="text-sm font-medium">
            {field.label}
          </Label>
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      </div>
    );
  }

  // Entity multiselect pickers — v1: honest coming-soon affordance. The
  // entity noun + copy derive from the control type so a driver-scoped
  // responsibility (e.g. settlement_review) never shows a "customer" picker.
  // The field's own label/helpText (from the responsibility's ConditionsUISpec)
  // drive the descriptive copy — nothing here is hardcoded to one agent.
  const entityNoun = MULTISELECT_ENTITY_NOUN[field.control] ?? 'item';
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{field.label}</Label>
      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {entityNoun.charAt(0).toUpperCase() + entityNoun.slice(1)} picker · coming soon
          </p>
          <p className="text-xs text-muted-foreground">
            You&apos;ll be able to pick specific {entityNoun}s here. For now, leave it empty to apply to all.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Entity noun per multiselect control type — keeps the picker copy correct
 *  per responsibility (customer-scoped vs driver-scoped) instead of hardcoding
 *  "customer". */
const MULTISELECT_ENTITY_NOUN: Record<string, string> = {
  'customer-multiselect': 'customer',
  'driver-multiselect': 'driver',
};
