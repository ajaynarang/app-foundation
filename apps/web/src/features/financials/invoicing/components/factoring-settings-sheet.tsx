'use client';

import { FormSheet } from '@/shared/components/ui/form-sheet';
import { BundleFormatSection } from './bundle-format-section';
import { DriverPayTimingSection } from './driver-pay-timing-section';

interface FactoringSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Tenant-level factoring settings (bundle format + driver pay timing) in a
 * single sheet. Triggered by the gear icon on the Factoring tab. ADMIN/OWNER
 * only — the gear button is hidden for other roles, and each section also
 * gates its own radio group server-side.
 */
export function FactoringSettingsSheet({ open, onOpenChange }: FactoringSettingsSheetProps) {
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Factoring Settings"
      description="Tenant-wide settings for how factor submissions and driver pay are handled."
      mode="view"
      pinnable
    >
      <div className="space-y-6">
        <BundleFormatSection />
        <DriverPayTimingSection />
      </div>
    </FormSheet>
  );
}
