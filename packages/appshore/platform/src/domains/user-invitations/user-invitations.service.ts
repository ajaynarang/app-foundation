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
import type { InvitationStatus, Prisma } from '@appshore/db';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { INVITATION_LIST_SELECT, toPublicInvitation, type InvitationListItem } from './invitation.serializer';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EmailService } from '../../infrastructure/notification/services/email.service';
import { SmsService } from '@appshore/kernel/infrastructure/sms/sms.service';
import { TwilioVerifyService } from '../../infrastructure/sms/twilio-verify.service';
import { PinService } from '../../auth/pin.service';
import { InviteUserDto, AcceptPhoneInvitationDto } from './dto/invite-user.dto';
import { generateId } from '@appshore/kernel/shared/utils/id-generator';
import { INVITATION_EXPIRY_MS } from '../../constants';
import { customAlphabet } from 'nanoid';
import { invalidState, stateLabel } from '@appshore/kernel/shared/errors/api-errors';
import { TenantEntitlementsService } from '../entitlements/tenant-entitlements.service';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 32);

/**
 * The same address in any case. The database holds one live account per `lower(email)` (index
 * `users_email_live_key`), so every lookup for an existing account or invitation must ignore case too, or it finds
 * nobody and the write that follows is refused.
 */
const sameEmail = (email: string) => ({ equals: email, mode: 'insensitive' as const });

const INVITATION_KEYSET = { field: 'createdAt', idField: 'invitationId', kind: 'date', direction: 'desc' } as const;

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

    // Create invitation
    const token = nanoid();
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
        token,
        status: 'PENDING',
        expiresAt,
      },
      // Only what the email and the public response need: never the inviter's whole row (password hash, PIN hash).
      include: {
        tenant: { select: { companyName: true } },
        invitedByUser: INVITATION_LIST_SELECT.invitedByUser,
      },
    });

    // Build invite link
    const frontendUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const inviteLink = `${frontendUrl}/accept-invitation?token=${token}`;
    const invitedByName = `${invitation.invitedByUser.firstName} ${invitation.invitedByUser.lastName}`;

    // Send via appropriate channel
    if (inviteChannel === 'SMS' && dto.phone) {
      const smsBody = `You've been invited by ${invitedByName}. Set up your account: ${inviteLink}`;
      await this.smsService.sendSms(dto.phone, smsBody);
    } else if (dto.email) {
      await this.emailService.sendUserInvitation(
        dto.email,
        invitation.firstName,
        invitation.lastName,
        invitedByName,
        invitation.tenant.companyName,
        token,
      );
    }

    return { ...toPublicInvitation(invitation), inviteLink };
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
   * Accept invitation and create user
   */
  async acceptInvitation(token: string, firebaseUid: string) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or invalid');
    }

    if (invitation.status !== 'PENDING') {
      throw invalidState('This invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      throw invalidState('This invitation has expired — ask for a new one');
    }

    return this.prisma.$transaction(async (tx) => {
      // Workspace model: an existing user accepting an invite JOINS the
      // workspace (new membership) instead of erroring.
      const existingUser = invitation.email
        ? await tx.user.findFirst({
            where: { email: sameEmail(invitation.email), deletedAt: null },
            include: { tenant: true },
          })
        : null;

      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            userId: generateId('user'),
            tenantId: invitation.tenantId,
            email: invitation.email,
            firstName: invitation.firstName,
            lastName: invitation.lastName,
            role: invitation.role,
            firebaseUid,
            emailVerified: true,
            isActive: true,
          },
          include: {
            tenant: true,
          },
        }));

      await tx.workspaceMember.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: invitation.tenantId } },
        update: { role: invitation.role },
        create: {
          userId: user.id,
          tenantId: invitation.tenantId,
          role: invitation.role,
          isDefault: !existingUser,
        },
      });

      // Update invitation status
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      });

      return user;
    });
  }

  /**
   * Accept phone-channel invitation: verify OTP, set PIN, create user
   */
  async acceptPhoneInvitation(dto: AcceptPhoneInvitationDto) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token: dto.token },
    });

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

    return this.prisma.$transaction(async (tx) => {
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

      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      });

      return user;
    });
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
   * Resend invitation with new token and reset expiry
   */
  async resendInvitation(invitationId: string, tenantIdString: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: tenantIdString },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const invitation = await this.prisma.userInvitation.findUnique({
      where: { invitationId },
      include: {
        tenant: { select: { companyName: true } },
        invitedByUser: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Another tenant's invitation is 404, the same as a missing one: a 400 would confirm that it exists.
    if (invitation.tenantId !== tenant.id) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      throw invalidState(`An invitation that is ${stateLabel(invitation.status)} cannot be resent`);
    }

    const newToken = nanoid();
    const newExpiry = new Date(Date.now() + INVITATION_EXPIRY_MS);

    const updatedInvitation = await this.prisma.userInvitation.update({
      where: { invitationId },
      data: {
        token: newToken,
        expiresAt: newExpiry,
      },
      select: INVITATION_LIST_SELECT,
    });

    const invitedByName = `${invitation.invitedByUser.firstName} ${invitation.invitedByUser.lastName}`;
    const frontendUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const inviteLink = `${frontendUrl}/accept-invitation?token=${newToken}`;

    if (invitation.inviteChannel === 'SMS' && invitation.phone) {
      const smsBody = `You've been invited by ${invitedByName}. Set up your account: ${inviteLink}`;
      await this.smsService.sendSms(invitation.phone, smsBody);
    } else if (invitation.email) {
      await this.emailService.sendUserInvitation(
        invitation.email,
        invitation.firstName,
        invitation.lastName,
        invitedByName,
        invitation.tenant.companyName,
        newToken,
      );
    }

    return { ...toPublicInvitation(updatedInvitation), inviteLink };
  }

  /**
   * Get the invite link for an existing pending invitation without regenerating the token
   */
  async getInvitationLink(invitationId: string, tenantIdString: string) {
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

    if (invitation.status !== 'PENDING') {
      throw invalidState(`An invitation that is ${stateLabel(invitation.status)} has no link to share`);
    }

    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const inviteLink = `${appUrl}/accept-invitation?token=${invitation.token}`;

    return { inviteLink };
  }

  /**
   * Get invitation by token (for public acceptance page)
   */
  async getInvitationByToken(token: string) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token },
      include: {
        tenant: {
          select: {
            tenantId: true,
            companyName: true,
            subdomain: true,
          },
        },
        invitedByUser: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      throw invalidState('This invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      throw invalidState('This invitation has expired — ask for a new one');
    }

    return invitation;
  }
}
