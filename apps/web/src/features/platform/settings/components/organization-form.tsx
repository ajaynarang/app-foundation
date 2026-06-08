'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Button } from '@sally/ui/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@sally/ui/components/ui/select';
import {
  CarrierType,
  FleetSize,
  type OrganizationProfile,
  type UpdateOrganizationProfileInput,
  UpdateOrganizationProfileSchema,
} from '@sally/shared-types';

import { extractFieldErrors } from '@/shared/lib/error-utils';

import { CARRIER_TYPE_OPTIONS, FLEET_SIZE_OPTIONS, TIMEZONE_OPTIONS } from '../organization-constants';

interface OrganizationFormProps {
  profile: OrganizationProfile;
  isSubmitting: boolean;
  onSubmit: (data: UpdateOrganizationProfileInput) => void;
  /** Mutation error from the parent — backend field errors surface inline. */
  submitError?: unknown;
}

type FormState = {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  dotNumber: string;
  mcNumber: string;
  carrierType: CarrierType;
  fleetSize: FleetSize | '';
  timezone: string;
};

/** Inline validation messages keyed by FormState field. */
type FieldErrors = Partial<Record<keyof FormState, string>>;

function profileToFormState(profile: OrganizationProfile): FormState {
  return {
    companyName: profile.companyName,
    contactEmail: profile.contactEmail ?? '',
    contactPhone: profile.contactPhone ?? '',
    dotNumber: profile.dotNumber ?? '',
    mcNumber: profile.mcNumber ?? '',
    carrierType: profile.carrierType,
    fleetSize: profile.fleetSize ?? '',
    timezone: profile.timezone,
  };
}

/**
 * Editable company-profile form (OWNER/ADMIN). Eight fields written through
 * the canonical tenant-settings service via `PATCH /tenants/me`. The timezone
 * Select preserves the saved value even when it falls outside the curated US
 * list. Empty strings on optional text fields are omitted from the payload.
 */
export function OrganizationForm({ profile, isSubmitting, onSubmit, submitError }: OrganizationFormProps) {
  const [form, setForm] = useState<FormState>(() => profileToFormState(profile));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Re-sync after a save invalidates + refetches the profile prop. Mirrors the
  // operations settings page precedent (settings/operations/page.tsx) — the
  // refetched server state becomes the new form baseline.
  useEffect(() => {
    setForm(profileToFormState(profile));
  }, [profile]);

  // Surface backend field errors (the global filter's `fieldErrors` map) inline,
  // in addition to the parent's toast.
  useEffect(() => {
    if (!submitError) return;
    const backendErrors = extractFieldErrors(submitError);
    if (backendErrors) setFieldErrors(backendErrors as FieldErrors);
  }, [submitError]);

  // Preserve the currently-saved timezone even if it's outside the curated list.
  const timezoneOptions = useMemo(() => {
    if (TIMEZONE_OPTIONS.some((o) => o.value === form.timezone)) return TIMEZONE_OPTIONS;
    return [{ value: form.timezone, label: form.timezone }, ...TIMEZONE_OPTIONS];
  }, [form.timezone]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear this field's error as soon as the user edits it.
    setFieldErrors((errs) => (errs[key] ? { ...errs, [key]: undefined } : errs));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: UpdateOrganizationProfileInput = {
      companyName: form.companyName.trim(),
      contactEmail: form.contactEmail.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      dotNumber: form.dotNumber.trim() || undefined,
      mcNumber: form.mcNumber.trim() || undefined,
      carrierType: form.carrierType,
      fleetSize: form.fleetSize || undefined,
      timezone: form.timezone,
    };

    // Validate against the canonical schema before hitting the network.
    const parsed = UpdateOrganizationProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !(field in errors)) {
          errors[field as keyof FormState] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="org-company-name">Company Name</Label>
          <Input
            id="org-company-name"
            value={form.companyName}
            onChange={(e) => set('companyName', e.target.value)}
            aria-invalid={!!fieldErrors.companyName}
            autoFocus
          />
          <FieldError message={fieldErrors.companyName} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-contact-email">Contact Email</Label>
          <Input
            id="org-contact-email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            aria-invalid={!!fieldErrors.contactEmail}
          />
          <FieldError message={fieldErrors.contactEmail} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-contact-phone">Contact Phone</Label>
          <Input
            id="org-contact-phone"
            value={form.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
            aria-invalid={!!fieldErrors.contactPhone}
          />
          <FieldError message={fieldErrors.contactPhone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-dot-number">DOT Number</Label>
          <Input
            id="org-dot-number"
            value={form.dotNumber}
            onChange={(e) => set('dotNumber', e.target.value)}
            aria-invalid={!!fieldErrors.dotNumber}
          />
          {fieldErrors.dotNumber ? (
            <FieldError message={fieldErrors.dotNumber} />
          ) : (
            <p className="text-xs text-muted-foreground">Digits only — no &quot;USDOT&quot; prefix.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-mc-number">MC Number</Label>
          <Input
            id="org-mc-number"
            value={form.mcNumber}
            onChange={(e) => set('mcNumber', e.target.value)}
            aria-invalid={!!fieldErrors.mcNumber}
          />
          {fieldErrors.mcNumber ? (
            <FieldError message={fieldErrors.mcNumber} />
          ) : (
            <p className="text-xs text-muted-foreground">Digits only — no &quot;MC-&quot; prefix.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-carrier-type">Carrier Type</Label>
          <Select value={form.carrierType} onValueChange={(v) => set('carrierType', v as CarrierType)}>
            <SelectTrigger id="org-carrier-type">
              <SelectValue placeholder="Select carrier type" />
            </SelectTrigger>
            <SelectContent>
              {CARRIER_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={fieldErrors.carrierType} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-fleet-size">Fleet Size</Label>
          <Select value={form.fleetSize} onValueChange={(v) => set('fleetSize', v as FleetSize)}>
            <SelectTrigger id="org-fleet-size">
              <SelectValue placeholder="Select fleet size" />
            </SelectTrigger>
            <SelectContent>
              {FLEET_SIZE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={fieldErrors.fleetSize} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="org-timezone">Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => set('timezone', v)}>
            <SelectTrigger id="org-timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={fieldErrors.timezone} />
          <p className="text-xs text-muted-foreground">Scheduled Sally tasks run in this timezone.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </form>
  );
}

/** Inline, dark-theme-safe validation message rendered under a field. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
