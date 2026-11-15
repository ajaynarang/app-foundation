import { InvitationStatus, UserRole } from '@app/shared-types';
import type { StatusVariant } from '@app/ui';

/** One label and one tone per invitation state (ui-grammar-guard.test.ts holds the tones). */
export const INVITATION_STATUS_VARIANTS: Record<InvitationStatus, StatusVariant> = {
  // Sent, waiting on the invitee: not started yet.
  [InvitationStatus.PENDING]: { label: 'Pending', tone: 'neutral' },
  [InvitationStatus.ACCEPTED]: { label: 'Accepted', tone: 'success' },
  [InvitationStatus.CANCELLED]: { label: 'Cancelled', tone: 'danger' },
  // Lapsed without an answer: retired, not stopped by anyone.
  [InvitationStatus.EXPIRED]: { label: 'Expired', tone: 'muted' },
};

/** A member can sign in (Active) or has been switched off (Inactive). */
export const MEMBER_STATE_VARIANTS: Record<'ACTIVE' | 'INACTIVE', StatusVariant> = {
  ACTIVE: { label: 'Active', tone: 'info' },
  INACTIVE: { label: 'Inactive', tone: 'muted' },
};

export function memberState(isActive: boolean): StatusVariant {
  return MEMBER_STATE_VARIANTS[isActive ? 'ACTIVE' : 'INACTIVE'];
}

/** Display names for roles. A role is not a status: it renders as an outline badge, never a tone. */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.MEMBER]: 'Member',
  [UserRole.SUPER_ADMIN]: 'Super admin',
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
