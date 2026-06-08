/**
 * Login activity UI constants — status/reason labels, filter option lists.
 *
 * Single source of truth for any literal string the UI shows. Enum values
 * are imported from @sally/shared-types so role/status additions to the
 * Prisma schema propagate automatically.
 */

import { USER_ROLES } from '@sally/shared-types';
import type { LoginEventStatus, LoginFailReason } from './types';

export const STATUS_VARIANTS: Record<LoginEventStatus, { label: string; className: string }> = {
  SUCCESS: { label: 'Success', className: 'bg-green-500/10 text-green-500' },
  FAILED: { label: 'Failed', className: 'bg-red-500/10 text-red-500' },
  LOGOUT: { label: 'Logout', className: 'bg-muted text-muted-foreground' },
};

export const FAIL_REASON_LABELS: Record<LoginFailReason, string> = {
  ACCOUNT_DISABLED: 'Account disabled',
  TENANT_INACTIVE: 'Tenant inactive',
  INVALID_TOKEN: 'Invalid token',
  USER_NOT_FOUND: 'User not found',
  OTHER: 'Other',
};

export const STATUS_OPTIONS: ReadonlyArray<{ value: LoginEventStatus; label: string }> = [
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'LOGOUT', label: 'Logout' },
];

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export const ROLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.values(USER_ROLES).map((role) => ({
  value: role,
  label: titleCase(role),
}));
