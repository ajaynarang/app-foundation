import { ApiProperty } from '@nestjs/swagger';
import { InvitationChannel, InvitationStatus, UserRole } from '@appshore/db';

/** Who sent an invitation — named by their public `userId`. */
export class InvitationInviter {
  @ApiProperty({ description: 'Inviter public user id' })
  userId: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

/** An invitation in the workspace list (`toPublicInvitation`) — never the acceptance token, no numeric ids. */
export class InvitationListEntry {
  @ApiProperty({ description: 'Invitation public id (inv_…)' })
  invitationId: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ enum: InvitationChannel })
  inviteChannel: InvitationChannel;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: InvitationStatus })
  status: InvitationStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: InvitationInviter, nullable: true })
  invitedBy: InvitationInviter | null;
}

/** `GET /invitations` — a cursor list, newest first. */
export class InvitationList {
  @ApiProperty({ type: [InvitationListEntry] })
  items: InvitationListEntry[];

  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` for the next page; null on the last' })
  nextCursor: string | null;

  @ApiProperty({ description: 'Total matching invitations' })
  total: number;
}

/**
 * `POST /invitations/:invitation_id/link` — a new acceptance link, shown once. Making it rotates the token, so the link
 * in the invitation email stops working.
 */
export class InvitationLink {
  @ApiProperty({ description: 'Acceptance URL (carries the new invitation token; shown once, never stored)' })
  inviteLink: string;
}

/** The workspace an invitation is for, by its public id. */
export class InvitationPreviewTenant {
  @ApiProperty({ description: 'Workspace public id' })
  tenantId: string;

  @ApiProperty()
  companyName: string;

  @ApiProperty({ type: String, nullable: true })
  subdomain: string | null;
}

/** Who sent the invitation, by name only. */
export class InvitationPreviewInviter {
  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

/**
 * `POST /invitations/preview` (public) — what the acceptance page shows. Never the token, no numeric ids, and no
 * inviter email.
 */
export class InvitationPreview {
  @ApiProperty({ description: 'Invitation public id' })
  invitationId: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ enum: InvitationChannel })
  inviteChannel: InvitationChannel;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ type: InvitationPreviewTenant })
  tenant: InvitationPreviewTenant;

  @ApiProperty({ type: InvitationPreviewInviter })
  invitedBy: InvitationPreviewInviter;
}
