'use client';

import { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useCustomFieldDefinitions } from '../hooks/use-custom-field-definitions';
import type { CustomFieldDefinition, CustomFieldEntityType } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'edit' | 'view' | 'driver';

interface CustomFieldsSectionProps {
  entityType: CustomFieldEntityType;
  values: Record<string, string | number | null>;
  onChange?: (values: Record<string, string | number | null>) => void;
  mode?: Mode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isEditable(def: CustomFieldDefinition, mode: Mode): boolean {
  if (mode === 'edit') return true;
  if (mode === 'driver') return def.driverEditable;
  return false;
}

function getStringValue(val: string | number | null | undefined): string {
  if (val == null) return '';
  return String(val);
}

// ─── Field Renderers ──────────────────────────────────────────────────────────

interface FieldProps {
  def: CustomFieldDefinition;
  value: string | number | null;
  onChange: (key: string, value: string | number | null) => void;
}

function EditableField({ def, value, onChange }: FieldProps) {
  const labelText = def.isRequired ? `${def.name} *` : def.name;
  const strValue = getStringValue(value);

  if (def.fieldType === 'SELECT') {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={def.fieldKey} className="text-xs text-muted-foreground">
          {labelText}
        </Label>
        <Select value={strValue} onValueChange={(v) => onChange(def.fieldKey, v || null)}>
          <SelectTrigger id={def.fieldKey} className="bg-background text-foreground border-border">
            <SelectValue placeholder={`Select ${def.name}`} />
          </SelectTrigger>
          <SelectContent>
            {(def.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const inputType = def.fieldType === 'NUMBER' ? 'number' : def.fieldType === 'DATE' ? 'date' : 'text';

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={def.fieldKey} className="text-xs text-muted-foreground">
        {labelText}
      </Label>
      <Input
        id={def.fieldKey}
        type={inputType}
        value={strValue}
        required={def.isRequired}
        className="bg-background text-foreground border-border"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(def.fieldKey, null);
          } else if (def.fieldType === 'NUMBER') {
            const num = Number(raw);
            onChange(def.fieldKey, isNaN(num) ? null : num);
          } else {
            onChange(def.fieldKey, raw);
          }
        }}
      />
    </div>
  );
}

function ReadOnlyField({ def, value }: { def: CustomFieldDefinition; value: string | number | null }) {
  const strValue = getStringValue(value);
  return <InfoItem label={def.name} value={strValue || null} />;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function CustomFieldsSkeleton() {
  return (
    <SheetSection icon={SlidersHorizontal} title="Custom Fields">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </SheetSection>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomFieldsSection({ entityType, values, onChange, mode = 'view' }: CustomFieldsSectionProps) {
  const { data: definitions, isLoading } = useCustomFieldDefinitions(entityType);

  const activeDefinitions = useMemo(() => (definitions ?? []).filter((d) => d.isActive), [definitions]);

  if (isLoading) {
    return <CustomFieldsSkeleton />;
  }

  if (!activeDefinitions.length) {
    return null;
  }

  function handleChange(key: string, value: string | number | null) {
    onChange?.({ ...values, [key]: value });
  }

  // In view mode, skip fields that have no value
  const visibleDefinitions =
    mode === 'view'
      ? activeDefinitions.filter((d) => {
          const v = values[d.fieldKey];
          return v != null && v !== '';
        })
      : activeDefinitions;

  if (mode === 'view' && visibleDefinitions.length === 0) {
    return null;
  }

  return (
    <SheetSection icon={SlidersHorizontal} title="Custom Fields">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visibleDefinitions.map((def) => {
          const value = values[def.fieldKey] ?? null;
          const editable = isEditable(def, mode);

          if (editable) {
            return <EditableField key={def.id} def={def} value={value} onChange={handleChange} />;
          }

          return <ReadOnlyField key={def.id} def={def} value={value} />;
        })}
      </div>
    </SheetSection>
  );
}
