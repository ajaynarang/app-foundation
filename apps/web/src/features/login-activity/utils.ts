/**
 * Login activity UI utilities — pure formatters used by table cells and detail sheets.
 */

import type { LoginActivityEvent, LoginFailReason } from './types';
import { FAIL_REASON_LABELS } from './constants';

export function failReasonLabel(reason: LoginFailReason | null | undefined): string | null {
  if (!reason) return null;
  return FAIL_REASON_LABELS[reason];
}

export function userDisplayName(user: LoginActivityEvent['user']): string {
  if (!user) return '(deleted user)';
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email;
}
