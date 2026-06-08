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
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { EmailService } from '../../../infrastructure/notification/services/email.service';
import { SmsService } from '../../../infrastructure/sms/sms.service';
import { TwilioVerifyService } from '../../../infrastructure/sms/twilio-verify.service';
import { PinService } from '../../../auth/pin.service';
import { InviteUserDto, AcceptPhoneInvitationDto } from './dto/invite-user.dto';
import { generateId } from '../../../shared/utils/id-generator';
import { INVITATION_EXPIRY_MS } from '../../../constants';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 32);

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

    // Check if user already exists (by email or phone)
    if (dto.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: { email: dto.email, tenantId },
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
        where: { email: dto.email, tenantId, status: 'PENDING' },
      });
      if (existingInvitation) {
        throw new ConflictException('Invitation already sent to this email');
      }
    }

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
      include: {
        tenant: true,
        invitedByUser: true,
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

    return { ...invitation, inviteLink };
  }

  /**
   * Get all invitations for a tenant
   * If tenantIdString is undefined, returns all invitations (for SUPER_ADMIN)
   */
  async getInvitations(tenantIdString?: string, status?: string) {
    let tenantDbId: number | undefined;

    // If tenant ID string provided, look up database ID
    if (tenantIdString) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { tenantId: tenantIdString },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      tenantDbId = tenant.id;
    }

    return this.prisma.userInvitation.findMany({
      where: {
        ...(tenantDbId && { tenantId: tenantDbId }),
        ...(status && { status: status as any }),
      },
      include: {
        invitedByUser: {
          select: {
            userId: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
      throw new BadRequestException('Invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    // Create user and update invitation in transaction
    return this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
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
      throw new BadRequestException('Invalid or expired invitation');
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

    if (invitation.tenantId !== tenant.id) {
      throw new BadRequestException('Invitation does not belong to your organization');
    }

    if (invitation.status === 'ACCEPTED') {
      throw new BadRequestException('Cannot cancel accepted invitation');
    }

    if (invitation.status === 'CANCELLED') {
      throw new BadRequestException('Invitation is already cancelled');
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

    if (invitation.tenantId !== tenant.id) {
      throw new BadRequestException('Invitation does not belong to your organization');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot resend invitation with status ${invitation.status}`);
    }

    const newToken = nanoid();
    const newExpiry = new Date(Date.now() + INVITATION_EXPIRY_MS);

    const updatedInvitation = await this.prisma.userInvitation.update({
      where: { invitationId },
      data: {
        token: newToken,
        expiresAt: newExpiry,
      },
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

    return { ...updatedInvitation, inviteLink };
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

    if (invitation.tenantId !== tenant.id) {
      throw new BadRequestException('Invitation does not belong to your organization');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot get link for invitation with status ${invitation.status}`);
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
      throw new BadRequestException('Invitation is no longer valid');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    return invitation;
  }
}
