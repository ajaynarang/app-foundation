import { TenantStatus } from '@app/shared-types';
import type { StatusVariant } from '@app/ui';

/** One label and one tone per tenant lifecycle state (ui-grammar-guard.test.ts holds the tones). */
export const TENANT_STATUS_VARIANTS: Record<TenantStatus, StatusVariant> = {
  // Waiting on a super-admin's call.
  [TenantStatus.PENDING_APPROVAL]: { label: 'Pending approval', tone: 'warning' },
  [TenantStatus.ACTIVE]: { label: 'Active', tone: 'info' },
  [TenantStatus.SUSPENDED]: { label: 'Suspended', tone: 'danger' },
  [TenantStatus.REJECTED]: { label: 'Rejected', tone: 'danger' },
};
