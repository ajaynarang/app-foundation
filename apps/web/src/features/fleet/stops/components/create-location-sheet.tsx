'use client';

import { useState } from 'react';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { useCreateLocation } from '../hooks/use-locations';
import { LocationFormFields, INITIAL_LOCATION_FORM } from './location-form-fields';
import type { LocationFormState } from './location-form-fields';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateLocationSheet({ open, onOpenChange }: Props) {
  const [form, setForm] = useState<LocationFormState>({ ...INITIAL_LOCATION_FORM });
  const createMutation = useCreateLocation();

  const handleSubmit = async () => {
    await createMutation.mutateAsync({
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state || undefined,
      zipCode: form.zipCode.trim() || undefined,
      locationType: form.locationType || undefined,
      contactName: form.contactName.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      contactEmail: form.contactEmail.trim() || undefined,
      appointmentRequired: form.appointmentRequired || undefined,
      notes: form.notes.trim() || undefined,
    });
    setForm({ ...INITIAL_LOCATION_FORM });
    onOpenChange(false);
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="New Location"
      description="Add a new facility or location to your network."
      mode="edit"
      onSubmit={handleSubmit}
      submitLabel="Create"
      isSubmitting={createMutation.isPending}
      submitDisabled={!form.name.trim()}
    >
      <LocationFormFields form={form} onChange={setForm} autoFocusName />
    </FormSheet>
  );
}
