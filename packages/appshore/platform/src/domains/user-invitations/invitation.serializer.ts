import type { InvitationChannel, InvitationStatus, Prisma, UserRole } from '@appshore/db';

/**
 * What the invitations list reads. The acceptance `token` is never selected — it is a bearer secret,
 * and whoever holds the list must not be able to accept on someone's behalf. No numeric id
 * either: the invitation is `invitationId`, the inviter is their `userId`.
 */
export const INVITATION_LIST_SELECT = {
  invitationId: true,
  email: true,
  phone: true,
  inviteChannel: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  expiresAt: true,
  acceptedAt: true,
  cancelledAt: true,
  createdAt: true,
  invitedByUser: { select: { userId: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.UserInvitationSelect;

type InvitationListRow = Prisma.UserInvitationGetPayload<{ select: typeof INVITATION_LIST_SELECT }>;

export interface InvitationListItem {
  invitationId: string;
  email: string | null;
  phone: string | null;
  inviteChannel: InvitationChannel;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  invitedBy: { userId: string; email: string | null; firstName: string; lastName: string } | null;
}

export function toPublicInvitation(row: InvitationListRow): InvitationListItem {
  const inviter = row.invitedByUser;
  return {
    invitationId: row.invitationId,
    email: row.email,
    phone: row.phone,
    inviteChannel: row.inviteChannel,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    invitedBy: inviter
      ? { userId: inviter.userId, email: inviter.email, firstName: inviter.firstName, lastName: inviter.lastName }
      : null,
  };
}

/**
 * What `POST /invitations/preview` reads: the public acceptance page's view of an invitation. Never the token hash,
 * no Int id, and the inviter by name only (their email is not the invitee's business).
 */
export const INVITATION_PREVIEW_SELECT = {
  invitationId: true,
  email: true,
  phone: true,
  inviteChannel: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  expiresAt: true,
  tenant: { select: { tenantId: true, companyName: true, subdomain: true } },
  invitedByUser: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserInvitationSelect;

type InvitationPreviewRow = Prisma.UserInvitationGetPayload<{ select: typeof INVITATION_PREVIEW_SELECT }>;

export interface InvitationPreviewItem {
  invitationId: string;
  email: string | null;
  phone: string | null;
  inviteChannel: InvitationChannel;
  firstName: string;
  lastName: string;
  role: UserRole;
  expiresAt: Date;
  tenant: { tenantId: string; companyName: string; subdomain: string | null };
  invitedBy: { firstName: string; lastName: string };
}

export function toInvitationPreview(row: InvitationPreviewRow): InvitationPreviewItem {
  return {
    invitationId: row.invitationId,
    email: row.email,
    phone: row.phone,
    inviteChannel: row.inviteChannel,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    expiresAt: row.expiresAt,
    tenant: { tenantId: row.tenant.tenantId, companyName: row.tenant.companyName, subdomain: row.tenant.subdomain },
    invitedBy: { firstName: row.invitedByUser.firstName, lastName: row.invitedByUser.lastName },
  };
}
