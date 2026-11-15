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

/** `GET /invitations/:invitation_id/link` — the shareable acceptance link of a pending invitation. */
export class InvitationLink {
  @ApiProperty({ description: 'Acceptance URL (carries the invitation token)' })
  inviteLink: string;
}

/**
 * `POST /invitations` (201) and `POST /invitations/:invitation_id/resend` (200) — the serialized invitation (as in the
 * list: no numeric ids, no token field) plus the acceptance link to share.
 */
export class InvitationIssued extends InvitationListEntry {
  @ApiProperty({ description: 'Acceptance URL (carries the invitation token — share it only with the invitee)' })
  inviteLink: string;
}
