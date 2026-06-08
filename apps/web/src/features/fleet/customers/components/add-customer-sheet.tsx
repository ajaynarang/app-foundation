'use client';

import { useState } from 'react';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { useCreateCustomer } from '../hooks/use-customers';
import { CustomerForm, EMPTY_CUSTOMER_FORM, type CustomerFormState } from './customer-form';

interface AddCustomerSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onCreated?: (customerId: string) => void;
}

export function AddCustomerSheet({ open, onOpenChange, onCreated }: AddCustomerSheetProps) {
  const [form, setForm] = useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);
  const createMutation = useCreateCustomer();

  const reset = () => setForm(EMPTY_CUSTOMER_FORM);

  const handleSubmit = async () => {
    // Submit button is disabled when companyName is empty, so a non-empty
    // value is guaranteed when this fires. Backend validation + the mutation
    // hook's showError handle every other failure mode.
    try {
      const created = await createMutation.mutateAsync({
        ...form,
        companyName: form.companyName.trim(),
      });
      onCreated?.(created.customerId);
      reset();
      onOpenChange(false);
    } catch {
      // mutation hook surfaces an error toast — keep the sheet open
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add Customer"
      mode="edit"
      onSubmit={handleSubmit}
      isSubmitting={createMutation.isPending}
      submitDisabled={!form.companyName.trim()}
    >
      <CustomerForm value={form} onChange={setForm} />
    </FormSheet>
  );
}
