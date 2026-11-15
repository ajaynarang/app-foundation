import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CursorList } from '@app/shared-types';
import { Prisma, type InvitationStatus, type UserRole } from '@appshore/db';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import {
  INVITATION_LIST_SELECT,
  INVITATION_PREVIEW_SELECT,
  toInvitationPreview,
  toPublicInvitation,
  type InvitationListItem,
  type InvitationPreviewItem,
} from './invitation.serializer';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EmailService } from '../../infrastructure/notification/services/email.service';
import { SmsService } from '@appshore/kernel/infrastructure/sms/sms.service';
import { TwilioVerifyService } from '../../infrastructure/sms/twilio-verify.service';
import { PinService } from '../../auth/pin.service';
import { InviteUserDto, AcceptPhoneInvitationDto } from './dto/invite-user.dto';
import { generateId } from '@appshore/kernel/shared/utils/id-generator';
import { INVITATION_EXPIRY_MS } from '../../constants';
import { customAlphabet } from 'nanoid';
import { duplicate, fieldError, invalidState, stateLabel } from '@appshore/kernel/shared/errors/api-errors';
import { TenantEntitlementsService } from '../entitlements/tenant-entitlements.service';
import { hashToken } from '../../auth/token-hash';
import * as bcrypt from 'bcrypt';
import { ApiErrorCode, AuthErrorCode } from '@app/shared-types';
import { toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';
import { FirebaseAuthService } from '../../auth/firebase-auth.service';
import { EmailVerificationService } from '../../auth/email-verification.service';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 32);

/**
 * A fresh acceptance token (32 characters over 36, about 165 bits). The raw value goes only into the link that is
 * emailed, texted or shown once; the row stores its hash (ADR-0012, "Recognised, so hashed").
 */
function newInvitationToken(): { raw: string; tokenHash: string } {
  const raw = nanoid();
  return { raw, tokenHash: hashToken(raw) };
}

/** Prisma's transaction client, as the conditional move below receives it. */
type InvitationTx = Pick<Prisma.TransactionClient, 'userInvitation'>;

/**
 * The same address in any case. The database holds one live account per `lower(email)` (index
 * `users_email_live_key`), so every lookup for an existing account or invitation must ignore case too, or it finds
 * nobody and the write that follows is refused.
 */
const sameEmail = (email: string) => ({ equals: email, mode: 'insensitive' as const });

const INVITATION_KEYSET = { field: 'createdAt', idField: 'invitationId', kind: 'date', direction: 'desc' } as const;

/** The same cost as `AuthService`: one rule for every password the platform stores. */
const PASSWORD_SALT_ROUNDS = 12;

/** The error envelope's body for a domain code (`AuthErrorCode`), as the `api-errors` factories build theirs. */
const errorBody = (code: string, detail: string) => ({ code, detail, message: detail });

/** 409 SIGN_IN_TO_ACCEPT: the address has an account, and only that account, signed in, can accept. */
const signInToAccept = () =>
  new ConflictException(
    errorBody(AuthErrorCode.SIGN_IN_TO_ACCEPT, 'An account already uses this email. Sign in to accept the invitation.'),
  );

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** `POST /invitations/accept`. Exactly one of `password` and `firebaseIdToken`. */
export interface AcceptInvitationInput {
  token: string;
  password?: string;
  firebaseIdToken?: string;
}

/** The account an accept created, with its tenant, for the controller to sign in. */
export type AcceptedAccount = Prisma.UserGetPayload<{ include: { tenant: true } }>;

/** `POST /invitations/join`: the workspace joined, by public id, and the caller's role in it. */
export interface InvitationJoined {
  workspace: { tenantId: string; name: string };
  role: UserRole;
}

const toJoined = (tenant: { tenantId: string; companyName: string }, role: UserRole): InvitationJoined => ({
  workspace: { tenantId: tenant.tenantId, name: tenant.companyName },
  role,
});

/** `GET /invitations`. */
export interface InvitationListQuery {
  /** The statuses to show; omitted: every status. */
  statuses?: InvitationStatus[];
  limit?: number;
  cursor?: string;
}

@Injectable()
export class UserInvitationsService {
  private readonly logger = new Logger(UserInvitationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private smsService: SmsService,
    private twilioVerifyService: TwilioVerifyService,
    private pinService: PinService,
    private configService: ConfigService,
    private entitlements: TenantEntitlementsService,
    private firebaseAuth: FirebaseAuthService,
    private emailVerification: EmailVerificationService,
  ) {}

  /**
   * Invite a new user to the tenant
   */
  async inviteUser(dto: InviteUserDto, currentUser: any) {
    // SUPER_ADMIN cannot invite users (they have no tenant)
    if (currentUser.role === 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Super admins cannot invite users. User invitations are managed by tenant owners/admins.',
      );
    }

    if (!currentUser.tenantId) {
      throw new BadRequestException('User must belong to a tenant to invite other users');
    }

    // Role-based invitation restrictions
    if (dto.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot invite users with SUPER_ADMIN role');
    }

    if (dto.role === 'OWNER') {
      throw new ForbiddenException('Cannot invite users with OWNER role. Each tenant can only have one owner.');
    }

    // ADMIN cannot invite other ADMINs (only OWNER can)
    if (currentUser.role === 'ADMIN' && dto.role === 'ADMIN') {
      throw new ForbiddenException('Only the tenant owner can invite additional admins');
    }

    // Get tenant database ID from tenantId string
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: currentUser.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const tenantId = tenant.id;

    // Get current user's database ID
    const invitingUser = await this.prisma.user.findUnique({
      where: { userId: currentUser.userId },
      select: { id: true },
    });

    if (!invitingUser) {
      throw new NotFoundException('Inviting user not found');
    }

    // Validate: at least one of email or phone required
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Either email or phone is required');
    }

    // Block only when the invitee is already a member of THIS workspace —
    // users belonging to other workspaces are invitable (workspace model).
    if (dto.email) {
      const existingMember = await this.prisma.workspaceMember.findFirst({
        where: { tenantId, user: { email: sameEmail(dto.email) } },
      });
      if (existingMember) {
        throw new ConflictException('User with this email is already a member of your workspace');
      }
      const existingUser = await this.prisma.user.findFirst({
        where: { email: sameEmail(dto.email), tenantId },
      });
      if (existingUser) {
        throw new ConflictException('User with this email already exists in your organization');
      }
    }

    if (dto.phone) {
      const existingPhoneUser = await this.prisma.user.findFirst({
        where: { phone: dto.phone },
      });
      if (existingPhoneUser) {
        throw new ConflictException('User with this phone number already exists');
      }
    }

    // Check if pending invitation exists
    if (dto.email) {
      const existingInvitation = await this.prisma.userInvitation.findFirst({
        where: { email: sameEmail(dto.email), tenantId, status: 'PENDING' },
      });
      if (existingInvitation) {
        throw new ConflictException('Invitation already sent to this email');
      }
    }

    // A pending invitation takes a seat: refused once the plan's user limit is in use.
    await this.entitlements.assertUserSeatAvailable(tenantId, { route: 'POST /invitations' });

    // Create invitation: only the token's hash is stored.
    const token = newInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

    // Determine channel: SMS if phone provided without email
    const inviteChannel = dto.phone && !dto.email ? 'SMS' : 'EMAIL';

    const invitation = await this.prisma.userInvitation.create({
      data: {
        invitationId: generateId('inv'),
        tenant: {
          connect: { id: tenantId },
        },
        invitedByUser: {
          connect: { id: invitingUser.id },
        },
        ...(dto.email && { email: dto.email }),
        ...(dto.phone && { phone: dto.phone }),
        inviteChannel: inviteChannel as any,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        tokenHash: token.tokenHash,
        status: 'PENDING',
        expiresAt,
      },
      // Only what the email and the public response need: never the inviter's whole row (password hash, PIN hash).
      include: {
        tenant: { select: { companyName: true } },
        invitedByUser: INVITATION_LIST_SELECT.invitedByUser,
      },
    });

    const invitedByName = `${invitation.invitedByUser.firstName} ${invitation.invitedByUser.lastName}`;

    // Send via appropriate channel. The link travels only to the invitee: the answer below never carries it.
    if (inviteChannel === 'SMS' && dto.phone) {
      const smsBody = `You've been invited by ${invitedByName}. Set up your account: ${this.inviteLinkFor(token.raw)}`;
      await this.smsService.sendSms(dto.phone, smsBody);
    } else if (dto.email) {
      await this.emailService.sendUserInvitation(
        dto.email,
        invitation.firstName,
        invitation.lastName,
        invitedByName,
        invitation.tenant.companyName,
        token.raw,
      );
    }

    return toPublicInvitation(invitation);
  }

  /**
   * A workspace's invitations (or, with no tenant, every tenant's), newest first, as a cursor list. The tiebreak
   * is the public `invitationId`, never the Int key. The acceptance token is never read: it is a bearer secret.
   */
  async listInvitations(
    tenantIdString?: string,
    query: InvitationListQuery = {},
  ): Promise<CursorList<InvitationListItem>> {
    const take = clampCursorLimit(query.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = query.cursor ? keysetWhere({ ...INVITATION_KEYSET, cursor: query.cursor }) : undefined;

    let tenantDbId: number | undefined;
    if (tenantIdString) {
      const tenant = await this.prisma.tenant.findUnique({ where: { tenantId: tenantIdString } });
      if (!tenant) throw new NotFoundException('Tenant not found');
      tenantDbId = tenant.id;
    }

    const scope: Prisma.UserInvitationWhereInput = {
      ...(tenantDbId !== undefined && { tenantId: tenantDbId }),
      ...(query.statuses && { status: { in: query.statuses } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.userInvitation.findMany({
        where: keyset ? { AND: [scope, keyset] } : scope,
        select: INVITATION_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { invitationId: 'desc' }],
        take: take + 1,
      }),
      this.prisma.userInvitation.count({ where: scope }),
    ]);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.invitationId));
    return { items: page.items.map(toPublicInvitation), nextCursor: page.nextCursor, total };
  }

  /**
   * The tenant DB id an acceptance token belongs to, or null for an unknown token. Read before the public routes enter
   * the invitation's tenant context; the token is matched, never returned or logged.
   */
  async tenantDbIdForToken(token: string): Promise<number | null> {
    if (!token) return null;
    const row = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { tenantId: true },
    });
    return row?.tenantId ?? null;
  }

  /**
   * Moves a pending invitation only while it is still the row the caller read: the same token and still `PENDING`.
   * Two accepts of one token, or a rotate that lands during an accept, both pass the checks read before the
   * transaction; the row lock this update takes lets exactly one of them through, and the other is a 409.
   */
  private async movePending(
    tx: InvitationTx,
    invitation: { id: number; tokenHash: string },
    data: Prisma.UserInvitationUncheckedUpdateManyInput,
    detail = 'This invitation is no longer valid',
  ): Promise<void> {
    const { count } = await tx.userInvitation.updateMany({
      where: { id: invitation.id, tokenHash: invitation.tokenHash, status: 'PENDING' },
      data,
    });
    if (count !== 1) throw invalidState(detail);
  }

  /** The acceptance link for a raw token. Built only to email, text or show it once; never stored or logged. */
  private inviteLinkFor(rawToken: string): string {
    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    return `${appUrl}/accept-invitation?token=${rawToken}`;
  }

  /**
   * `POST /invitations/accept` (public): a NEW account from an email invitation, signed in by the controller. The
   * token proves the inviter's chosen address only when it travelled by email alone (`linkSharedAt` null), so only
   * then does the account start verified; a copied link makes an unverified account, which is emailed a verification
   * link after the commit. The credential is a password or a verified Firebase ID token: the uid comes from the
   * token, never the body. An email that already has a live account is 409 SIGN_IN_TO_ACCEPT and nothing is written:
   * a token alone never attaches an existing account (that is `joinInvitation`, signed in).
   */
  async acceptInvitation(input: AcceptInvitationInput): Promise<AcceptedAccount> {
    if (Boolean(input.password) === Boolean(input.firebaseIdToken)) {
      throw fieldError('password', 'Send a password or a firebaseIdToken, not both');
    }

    const invitation = await this.findPendingByToken(input.token);

    if (invitation.inviteChannel !== 'EMAIL' || !invitation.email) {
      throw invalidState('Accept this invitation with the code sent to your phone');
    }
    const email = invitation.email;

    if (await this.liveAccountWithEmail(this.prisma, email)) throw signInToAccept();

    let firebaseUid: string | null = null;
    let passwordHash: string | null = null;
    if (input.firebaseIdToken) {
      const decoded = await this.firebaseAuth.verifyFirebaseToken(input.firebaseIdToken);
      if (decoded.email?.toLowerCase().trim() !== email.toLowerCase().trim()) {
        throw new ForbiddenException(
          errorBody(
            AuthErrorCode.INVITATION_EMAIL_MISMATCH,
            'This sign-in is for a different email than the invitation.',
          ),
        );
      }
      const linked = await this.prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
      if (linked) throw duplicate('This Firebase account is already linked to another account');
      firebaseUid = decoded.uid;
    } else {
      passwordHash = await bcrypt.hash(input.password as string, PASSWORD_SALT_ROUNDS);
    }

    // Proof of the mailbox only when no one but the invitee has seen this token.
    const emailVerified = invitation.linkSharedAt === null;

    let user: AcceptedAccount;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // Claimed first: a second accept of the same token waits on this row, then finds it no longer pending.
        await this.movePending(tx, invitation, { status: 'ACCEPTED', acceptedAt: new Date() });

        const created = await tx.user.create({
          data: {
            userId: generateId('user'),
            tenantId: invitation.tenantId,
            email,
            firstName: invitation.firstName,
            lastName: invitation.lastName,
            role: invitation.role,
            passwordHash,
            firebaseUid,
            emailVerified,
            isActive: true,
          },
          include: { tenant: true },
        });
        await tx.workspaceMember.create({
          data: { userId: created.id, tenantId: invitation.tenantId, role: invitation.role, isDefault: true },
        });
        await tx.userPreferences.create({ data: { userId: created.id } });
        await tx.userInvitation.update({ where: { id: invitation.id }, data: { acceptedByUserId: created.id } });
        return created;
      });
    } catch (err) {
      // An account with this email appeared after the check above (the live-email index refused the insert).
      if (isUniqueViolation(err) && (await this.liveAccountWithEmail(this.prisma, email))) throw signInToAccept();
      throw err;
    }

    if (!user.emailVerified) await this.issueVerification(user);
    return user;
  }

  /**
   * `POST /invitations/join` (signed in, JWT session only): the caller's OWN account joins the invitation's
   * workspace in one step (D10). Every check reads the user row, never the JWT claims (which can be 15 minutes old):
   * a super admin never joins (403 FORBIDDEN), and the account's email must be the invitation's (403
   * INVITATION_EMAIL_MISMATCH, naming neither address). An unverified account still joins: when the token travelled
   * by email alone (`linkSharedAt` null), holding it proves the mailbox, so the join also verifies the email and uses
   * up the account's verification links, in the same transaction; a shared link proves nothing, so the account
   * joins and stays unverified (its banner offers a resend). This is safe against a pre-hijack: an attacker who
   * registered the victim's address first cannot hold an unshared emailed token without the victim's inbox, and the
   * victim cannot sign in to the attacker's account, so they take it back with a reset (D9). A copied link that
   * reaches the attacker lets them join unverified, the same accepted risk as a new account from a shared link. A
   * member keeps their role. A retry by the account that already accepted answers the same body, so a lost response
   * is safe to retry. Runs as the invitation's tenant (`runAsInvitationTenant`, set by the controller).
   */
  async joinInvitation(token: string, callerDbId: number): Promise<InvitationJoined> {
    const found = token
      ? await this.prisma.userInvitation.findUnique({
          where: { tokenHash: hashToken(token) },
          include: { tenant: { select: { tenantId: true, companyName: true } } },
        })
      : null;
    if (!found) throw new NotFoundException('Invitation not found or invalid');

    if (found.status === 'ACCEPTED' && found.acceptedByUserId === callerDbId) {
      const membership = await this.prisma.workspaceMember.findUnique({
        where: { userId_tenantId: { userId: callerDbId, tenantId: found.tenantId } },
        select: { role: true },
      });
      if (membership) return toJoined(found.tenant, membership.role);
    }
    this.assertPending(found);

    const caller = await this.prisma.user.findUnique({
      where: { id: callerDbId },
      select: { id: true, email: true, emailVerified: true, deletedAt: true, role: true },
    });
    if (!caller || caller.deletedAt) throw new UnauthorizedException('Sign in again to accept this invitation');
    if (caller.role === 'SUPER_ADMIN') {
      throw new ForbiddenException(errorBody(ApiErrorCode.FORBIDDEN, 'Super admins do not join workspaces'));
    }
    if (!found.email || !caller.email || caller.email.toLowerCase().trim() !== found.email.toLowerCase().trim()) {
      throw new ForbiddenException(
        errorBody(
          AuthErrorCode.INVITATION_EMAIL_MISMATCH,
          'This invitation is for a different email. Sign in with that account.',
        ),
      );
    }
    // Proof of the mailbox only when no one but the invitee has seen this token (the rule `acceptInvitation` uses).
    const verifiesEmail = !caller.emailVerified && found.inviteChannel === 'EMAIL' && found.linkSharedAt === null;

    const role = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.movePending(tx, found, { status: 'ACCEPTED', acceptedAt: now, acceptedByUserId: caller.id });
      if (verifiesEmail) {
        // Verify the address that was checked above, not just the account: if the email changed since, the
        // token proves nothing about the new one, so the whole join rolls back.
        const { count } = await tx.user.updateMany({
          where: { id: caller.id, email: caller.email, deletedAt: null },
          data: { emailVerified: true },
        });
        if (count !== 1) throw invalidState('Your account changed while joining. Sign in again and retry.');
        await tx.emailVerificationToken.updateMany({
          where: { userId: caller.id, usedAt: null },
          data: { usedAt: now },
        });
      }
      // An existing member keeps the role they have: an invitation never changes it.
      const membership = await tx.workspaceMember.upsert({
        where: { userId_tenantId: { userId: caller.id, tenantId: found.tenantId } },
        update: {},
        create: { userId: caller.id, tenantId: found.tenantId, role: found.role, isDefault: false },
        select: { role: true },
      });
      return membership.role;
    });

    return toJoined(found.tenant, role);
  }

  /** The pending, unexpired invitation a raw token names. Unknown: 404; no longer pending or expired: 409. */
  private async findPendingByToken(token: string) {
    const invitation = token
      ? await this.prisma.userInvitation.findUnique({ where: { tokenHash: hashToken(token) } })
      : null;
    if (!invitation) throw new NotFoundException('Invitation not found or invalid');
    this.assertPending(invitation);
    return invitation;
  }

  private assertPending(invitation: { status: InvitationStatus; expiresAt: Date }): void {
    if (invitation.status !== 'PENDING') throw invalidState('This invitation is no longer valid');
    if (invitation.expiresAt < new Date()) throw invalidState('This invitation has expired — ask for a new one');
  }

  private async liveAccountWithEmail(db: Pick<PrismaService, 'user'>, email: string): Promise<boolean> {
    const row = await db.user.findFirst({ where: { email: sameEmail(email), deletedAt: null }, select: { id: true } });
    return row !== null;
  }

  /** After the commit. A send failure is logged inside `issue`; nothing here may fail the accept. */
  private async issueVerification(user: {
    id: number;
    email: string | null;
    firstName: string;
    emailVerified: boolean;
  }) {
    try {
      await this.emailVerification.issue(user, { reason: 'invitation' });
    } catch (err) {
      this.logger.warn({ msg: 'Verification token was not issued on invitation accept', err: toLoggableError(err) });
    }
  }

  /**
   * Accept phone-channel invitation: verify OTP, set PIN, create user
   */
  async acceptPhoneInvitation(dto: AcceptPhoneInvitationDto) {
    const invitation = dto.token
      ? await this.prisma.userInvitation.findUnique({ where: { tokenHash: hashToken(dto.token) } })
      : null;

    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
      throw invalidState('This invitation is invalid or has expired — ask for a new one');
    }

    // Validate that the phone number matches what the invitation was sent to
    if (invitation.phone && invitation.phone !== dto.phone) {
      throw new BadRequestException('Phone number does not match invitation');
    }

    // Verify OTP — use the phone from the invitation (authoritative), not the request
    const verificationPhone = invitation.phone ?? dto.phone;
    const isValid = await this.twilioVerifyService.checkVerification(verificationPhone, dto.otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    // Hash PIN
    const pinHash = await this.pinService.hashPin(dto.pin);

    const user = await this.prisma.$transaction(async (tx) => {
      await this.movePending(tx, invitation, { status: 'ACCEPTED', acceptedAt: new Date() });

      // The phone path signs the caller in as the account it returns, so it never joins an existing account: that
      // would hand whoever holds the phone a session on someone else's email account. The email link does the join.
      if (invitation.email) {
        const existingUser = await tx.user.findFirst({
          where: { email: sameEmail(invitation.email), deletedAt: null },
          select: { id: true },
        });
        if (existingUser) {
          throw new ConflictException(
            'An account already uses this email. Accept the invitation from the email link and sign in to that account.',
          );
        }
      }

      const user = await tx.user.create({
        data: {
          userId: generateId('user'),
          tenantId: invitation.tenantId,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          role: invitation.role,
          phone: dto.phone,
          phoneVerified: true,
          pinHash,
          isActive: true,
          ...(invitation.email && { email: invitation.email }),
        },
        include: { tenant: true },
      });

      await tx.workspaceMember.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: invitation.tenantId } },
        update: { role: invitation.role },
        create: { userId: user.id, tenantId: invitation.tenantId, role: invitation.role, isDefault: true },
      });

      await tx.userInvitation.update({ where: { id: invitation.id }, data: { acceptedByUserId: user.id } });

      return user;
    });

    // The inviter chose the email, so it starts unverified; the person is signed in by this accept and can use the
    // link. Its accept already refused an email that belongs to a live account.
    if (user.email && !user.emailVerified) await this.issueVerification(user);
    return user;
  }

  /**
   * Cancel invitation
   */
  async cancelInvitation(invitationId: string, tenantIdString: string, reason?: string) {
    // Get tenant database ID from tenantId string
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: tenantIdString },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const invitation = await this.prisma.userInvitation.findUnique({
      where: { invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Another tenant's invitation is 404, the same as a missing one: a 400 would confirm that it exists.
    if (invitation.tenantId !== tenant.id) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status === 'ACCEPTED') {
      throw invalidState('An accepted invitation cannot be cancelled');
    }

    if (invitation.status === 'CANCELLED') {
      throw invalidState('This invitation is already cancelled');
    }

    return this.prisma.userInvitation.update({
      where: { invitationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
  }

  /**
   * Resend: rotates the token (the old link stops working), resets the expiry and sends the new link to the invitee
   * only. The new token has travelled by email or SMS alone, so `linkSharedAt` is cleared. The answer is the public
   * invitation, never the link.
   */
  async resendInvitation(invitationId: string, tenantIdString: string): Promise<InvitationListItem> {
    const invitation = await this.findTenantInvitation(invitationId, tenantIdString, {
      tenant: { select: { companyName: true } },
      invitedByUser: { select: { firstName: true, lastName: true } },
    });

    if (invitation.status !== 'PENDING') {
      throw invalidState(`An invitation that is ${stateLabel(invitation.status)} cannot be resent`);
    }

    const token = newInvitationToken();
    const updatedInvitation = await this.prisma.$transaction(async (tx) => {
      await this.movePending(
        tx,
        invitation,
        { tokenHash: token.tokenHash, expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS), linkSharedAt: null },
        'This invitation changed while it was being resent. Reload and try again.',
      );
      return tx.userInvitation.findUniqueOrThrow({ where: { id: invitation.id }, select: INVITATION_LIST_SELECT });
    });

    const invitedByName = `${invitation.invitedByUser.firstName} ${invitation.invitedByUser.lastName}`;

    if (invitation.inviteChannel === 'SMS' && invitation.phone) {
      const smsBody = `You've been invited by ${invitedByName}. Set up your account: ${this.inviteLinkFor(token.raw)}`;
      await this.smsService.sendSms(invitation.phone, smsBody);
    } else if (invitation.email) {
      await this.emailService.sendUserInvitation(
        invitation.email,
        invitation.firstName,
        invitation.lastName,
        invitedByName,
        invitation.tenant.companyName,
        token.raw,
      );
    }

    return toPublicInvitation(updatedInvitation);
  }

  /**
   * `POST /invitations/:invitation_id/link` (OWNER/ADMIN): the only way to get a shareable link. The stored token is
   * only a hash, so a link cannot be read back; this rotates the token (the emailed link stops working), stamps
   * `linkSharedAt` (the token is no longer proof of the mailbox) and returns the new link once. Nothing is sent.
   */
  async rotateInvitationLink(invitationId: string, tenantIdString: string): Promise<{ inviteLink: string }> {
    const invitation = await this.findTenantInvitation(invitationId, tenantIdString);

    if (invitation.status !== 'PENDING') {
      throw invalidState(`An invitation that is ${stateLabel(invitation.status)} has no link to share`);
    }

    const token = newInvitationToken();
    await this.prisma.$transaction((tx) =>
      this.movePending(
        tx,
        invitation,
        { tokenHash: token.tokenHash, linkSharedAt: new Date() },
        'This invitation changed while its link was being made. Reload and try again.',
      ),
    );

    return { inviteLink: this.inviteLinkFor(token.raw) };
  }

  /**
   * `POST /invitations/preview` (public, the acceptance page): what the invitee needs to decide, by the token in the
   * body. Never the token or its hash, no Int id, and the inviter by name only. Unknown token: 404; no longer
   * pending or expired: 409.
   */
  async previewInvitation(token: string): Promise<InvitationPreviewItem> {
    const invitation = token
      ? await this.prisma.userInvitation.findUnique({
          where: { tokenHash: hashToken(token) },
          select: INVITATION_PREVIEW_SELECT,
        })
      : null;

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      throw invalidState('This invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      throw invalidState('This invitation has expired — ask for a new one');
    }

    return toInvitationPreview(invitation);
  }

  /** The caller's workspace's invitation, or 404: another tenant's invitation answers the same as a missing one. */
  private async findTenantInvitation<I extends Prisma.UserInvitationInclude = Record<string, never>>(
    invitationId: string,
    tenantIdString: string,
    include?: I,
  ): Promise<Prisma.UserInvitationGetPayload<{ include: I }>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: tenantIdString },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const invitation = (await this.prisma.userInvitation.findUnique({
      where: { invitationId },
      ...(include && { include }),
    })) as Prisma.UserInvitationGetPayload<{ include: I }> | null;

    // Another tenant's invitation is 404, the same as a missing one: a 400 would confirm that it exists.
    if (!invitation || invitation.tenantId !== tenant.id) {
      throw new NotFoundException('Invitation not found');
    }

    return invitation;
  }
}
