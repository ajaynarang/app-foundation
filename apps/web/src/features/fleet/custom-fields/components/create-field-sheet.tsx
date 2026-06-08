'use client';

import { useState, useCallback, useEffect } from 'react';
import { Type, Hash, CalendarDays, List, Plus, X } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { cn } from '@sally/ui';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { useCreateCustomFieldDefinition } from '../hooks/use-custom-field-definitions';
import type { CustomFieldEntityType, CustomFieldType } from '../types';

interface FieldTypeOption {
  value: string;
  fieldType: CustomFieldType;
  label: string;
  icon: React.ElementType;
  description: string;
}

const FIELD_TYPES: FieldTypeOption[] = [
  { value: 'TEXT', fieldType: 'TEXT', label: 'Text', icon: Type, description: 'Single or multi-line text' },
  { value: 'NUMBER', fieldType: 'NUMBER', label: 'Number', icon: Hash, description: 'Numeric values' },
  { value: 'DATE', fieldType: 'DATE', label: 'Date', icon: CalendarDays, description: 'Calendar date picker' },
  { value: 'SELECT', fieldType: 'SELECT', label: 'Select', icon: List, description: 'Dropdown with options' },
];

interface CreateFieldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: CustomFieldEntityType;
}

interface FormState {
  name: string;
  fieldType: CustomFieldType;
  options: string[];
  isRequired: boolean;
  driverEditable: boolean;
  showOnInvoice: boolean;
  showOnBol: boolean;
}

const DEFAULT_FORM: FormState = {
  name: '',
  fieldType: 'TEXT',
  options: [''],
  isRequired: false,
  driverEditable: false,
  showOnInvoice: false,
  showOnBol: false,
};

export function CreateFieldSheet({ open, onOpenChange, entityType }: CreateFieldSheetProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const [optionErrors, setOptionErrors] = useState<Record<number, string>>({});

  const createMutation = useCreateCustomFieldDefinition();

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setForm(DEFAULT_FORM);
      setNameError(null);
      setOptionErrors({});
    }
  }, [open]);

  const handleFieldChange = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'name') setNameError(null);
  }, []);

  const addOption = () => {
    setForm((prev) => ({ ...prev, options: [...prev.options, ''] }));
  };

  const updateOption = (index: number, value: string) => {
    setForm((prev) => {
      const options = [...prev.options];
      options[index] = value;
      return { ...prev, options };
    });
    setOptionErrors((prev) => ({ ...prev, [index]: '' }));
  };

  const removeOption = (index: number) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const validate = useCallback((): boolean => {
    let valid = true;
    if (!form.name.trim()) {
      setNameError('Field name is required');
      valid = false;
    }
    if (form.fieldType === 'SELECT') {
      const filledOptions = form.options.filter((o) => o.trim());
      if (filledOptions.length === 0) {
        setOptionErrors({ 0: 'At least one option is required for Select fields' });
        valid = false;
      }
      const errs: Record<number, string> = {};
      form.options.forEach((o, i) => {
        if (!o.trim()) errs[i] = 'Option cannot be empty';
      });
      if (Object.keys(errs).length > 0) {
        setOptionErrors(errs);
        valid = false;
      }
    }
    return valid;
  }, [form.name, form.fieldType, form.options]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    const options: string[] = form.fieldType === 'SELECT' ? form.options.filter((o) => o.trim()) : [];

    createMutation.mutate(
      {
        entityType,
        name: form.name.trim(),
        fieldType: form.fieldType,
        options,
        isRequired: form.isRequired,
        driverEditable: form.driverEditable,
        showOnInvoice: form.showOnInvoice,
        showOnBol: form.showOnBol,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }, [form, entityType, createMutation, onOpenChange, validate]);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add Custom Field"
      mode="edit"
      onSubmit={handleSubmit}
      submitLabel="Create Field"
      isSubmitting={createMutation.isPending}
    >
      <div className="space-y-6">
        {/* Field Name */}
        <div className="space-y-2">
          <Label htmlFor="field-name">
            Field Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="field-name"
            placeholder="e.g. Purchase Order #"
            value={form.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            className={cn(nameError && 'border-destructive')}
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>

        {/* Field Type — visual card selector */}
        <div className="space-y-2">
          <Label>Field Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {FIELD_TYPES.map((ft) => (
              <button
                key={ft.value}
                type="button"
                onClick={() => handleFieldChange('fieldType', ft.fieldType)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                  form.fieldType === ft.fieldType
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-foreground',
                )}
              >
                <ft.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{ft.label}</span>
                <span className="text-xs opacity-70">{ft.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* SELECT options */}
        {form.fieldType === 'SELECT' && (
          <div className="space-y-2">
            <Label>Options</Label>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2">
                    <Input
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      className={cn(optionErrors[i] && 'border-destructive', 'flex-1')}
                    />
                    {form.options.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeOption(i)}
                        aria-label="Remove option"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {optionErrors[i] && <p className="text-xs text-destructive">{optionErrors[i]}</p>}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addOption} className="w-full">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Option
              </Button>
            </div>
          </div>
        )}

        {/* Checkboxes */}
        <div className="space-y-3">
          <Label>Behavior</Label>
          {[
            { key: 'isRequired' as const, label: 'Required', description: 'Must be filled before saving' },
            { key: 'driverEditable' as const, label: 'Driver visible', description: 'Shown in driver app' },
            { key: 'showOnInvoice' as const, label: 'Show on invoice', description: 'Printed on invoices' },
            { key: 'showOnBol' as const, label: 'Show on BOL', description: 'Printed on bill of lading' },
          ].map(({ key, label, description }) => (
            <div key={key} className="flex items-start gap-3">
              <Checkbox
                id={key}
                checked={form[key]}
                onCheckedChange={(checked) => handleFieldChange(key, !!checked)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor={key} className="cursor-pointer font-normal">
                  {label}
                </Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </FormSheet>
  );
}
