import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { JwtTokenService, AuthMethod } from './jwt.service';
import { UserProfileDto } from './dto/login.dto';
import { FirebaseExchangeDto } from './dto/firebase-exchange.dto';
import { FirebaseAuthService } from './firebase-auth.service';
import { PinService } from './pin.service';
import { TwilioVerifyService } from '../infrastructure/sms/twilio-verify.service';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { PasswordLoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password-login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmailService } from '../infrastructure/notification/services/email.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginEventService } from './login-event.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtTokenService: JwtTokenService,
    private firebaseAuthService: FirebaseAuthService,
    private pinService: PinService,
    private twilioVerifyService: TwilioVerifyService,
    private loginEventService: LoginEventService,
    private emailService: EmailService,
  ) {}

  private static readonly PASSWORD_SALT_ROUNDS = 12;
  private static readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

  async refreshAccessToken(userId: string, tokenId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');
    const accessToken = this.jwtTokenService.generateAccessTokenOnly({
      userId: user.userId,
      email: user.email,
      role: user.role,
      tenantId: user.tenant?.tenantId,
      // Keep the new access token tied to the same refresh-token session
      // so logout can revoke it.
      sid: tokenId,
    });
    return { accessToken, user: this.toUserProfile(user) };
  }

  async logout(tokenId: string, userId: number, tenantId: number | null): Promise<void> {
    await this.jwtTokenService.revokeRefreshToken(tokenId);
    await this.loginEventService.recordLogout({
      userId,
      tenantId,
      sessionId: tokenId,
    });
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { tenant: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toUserProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileDto> {
    if (dto.firstName === undefined && dto.lastName === undefined) {
      return this.getProfile(userId);
    }
    try {
      const user = await this.prisma.user.update({
        where: { userId },
        data: {
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        },
        include: { tenant: true },
      });
      return this.toUserProfile(user);
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('User not found');
      throw err;
    }
  }

  async recordPasswordChange(
    userId: string,
    currentTokenId: string | null,
    revokeOtherSessions: boolean,
    passwords?: { currentPassword?: string; newPassword?: string },
  ): Promise<{ sessionsRevoked: number }> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // First-party accounts change the password here; Firebase accounts only
    // record the change (Firebase owns the credential).
    let newPasswordHash: string | undefined;
    if (passwords?.newPassword) {
      if (user.passwordHash) {
        if (!passwords.currentPassword || !(await bcrypt.compare(passwords.currentPassword, user.passwordHash))) {
          throw new UnauthorizedException('Current password is incorrect');
        }
      }
      newPasswordHash = await bcrypt.hash(passwords.newPassword, AuthService.PASSWORD_SALT_ROUNDS);
    }

    await this.prisma.user.update({
      where: { userId },
      data: { passwordChangedAt: new Date(), ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}) },
    });

    let sessionsRevoked = 0;

    if (revokeOtherSessions) {
      const result = await this.prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          isRevoked: false,
          ...(currentTokenId ? { tokenId: { not: currentTokenId } } : {}),
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });
      sessionsRevoked = result.count;
    }

    return { sessionsRevoked };
  }

  /**
   * First-party email + password login. Works with zero external services —
   * this is the starter's primary credential. Firebase exchange and phone
   * OTP/PIN remain as optional alternatives.
   */
  async loginWithPassword(dto: PasswordLoginDto, meta: { ip: string | null; userAgent: string | null }) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { tenant: true },
      orderBy: { id: 'asc' },
    });
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (!user.passwordHash) {
      // Account exists but authenticates via Firebase/phone. The web client
      // uses this code to fall back to the Firebase flow when configured.
      throw new UnauthorizedException({
        message: 'This account does not use password sign-in.',
        code: 'PASSWORD_NOT_SET',
      });
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      await this.loginEventService.recordFailure({
        userId: user.id,
        tenantId: user.tenant?.id ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'invalid_credentials' as const,
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      await this.loginEventService.recordFailure({
        userId: user.id,
        tenantId: user.tenant?.id ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'account_disabled' as const,
      });
      throw new UnauthorizedException('Account is deactivated. Please contact support.');
    }
    if (user.tenant && (user.tenant.status !== 'ACTIVE' || !user.tenant.isActive)) {
      await this.loginEventService.recordFailure({
        userId: user.id,
        tenantId: user.tenant?.id ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'tenant_inactive' as const,
      });
      throw new UnauthorizedException('Your organization account is pending approval. Please check back later.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { accessToken, refreshToken, refreshTokenId } = await this.jwtTokenService.generateTokenPair(
      {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
        tenantId: user.tenant?.tenantId,
      },
      'email_password' satisfies AuthMethod,
    );
    await this.loginEventService.recordSuccess({
      userId: user.id,
      tenantId: user.tenant?.id ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      sessionId: refreshTokenId,
    });
    return { accessToken, refreshToken, user: this.toUserProfile(user) };
  }

  /**
   * Forgot-password: always resolves 200 (no account enumeration). Stores a
   * SHA-256 hash of a one-time token; the raw token goes into the emailed
   * link. Without SMTP configured (local dev) the link is logged instead.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true, deletedAt: null },
      orderBy: { id: 'asc' },
    });
    if (!user) return; // do not reveal whether the email exists
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + AuthService.RESET_TOKEN_TTL_MS),
      },
    });
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    try {
      await this.emailService.sendEmail({
        to: email,
        subject: 'Reset your password',
        html: `<p>Hi ${user.firstName},</p><p>Someone requested a password reset for your account. This link expires in 1 hour:</p><p><a href="${resetUrl}">Reset your password</a></p><p>If this wasn't you, you can safely ignore this email.</p>`,
        text: `Hi ${user.firstName},\n\nReset your password (expires in 1 hour): ${resetUrl}\n\nIf this wasn't you, ignore this email.`,
      });
    } catch (err) {
      // No SMTP in local dev — surface the link in the server log so the
      // flow still works end-to-end.
      this.logger.warn(`Email delivery unavailable — password reset link for ${email}: ${resetUrl}`);
    }
  }

  /** Complete a password reset: consumes the one-time token, revokes all sessions. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('This reset link is invalid or has expired. Please request a new one.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, AuthService.PASSWORD_SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      }),
    ]);
  }

  async exchangeFirebaseToken(dto: FirebaseExchangeDto, meta: { ip: string | null; userAgent: string | null }) {
    const decodedToken = await this.firebaseAuthService.verifyFirebaseToken(dto.firebaseToken);
    const user = await this.firebaseAuthService.findOrCreateUserByFirebaseUid(decodedToken.uid, decodedToken.email);
    if (!user) {
      this.logger.warn(`Login attempt for unregistered Firebase UID: ${decodedToken.uid} (ip: ${meta.ip})`);
      throw new UnauthorizedException('User not found. Please complete registration.');
    }
    if (!user.isActive) {
      await this.loginEventService.recordFailure({
        userId: user.id,
        tenantId: user.tenant?.id ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'account_disabled' as const,
      });
      throw new UnauthorizedException('Account is deactivated. Please contact support.');
    }
    if (user.tenant && user.tenant.status !== 'ACTIVE') {
      await this.loginEventService.recordFailure({
        userId: user.id,
        tenantId: user.tenant?.id ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'tenant_inactive' as const,
      });
      throw new UnauthorizedException('Your organization account is pending approval. Please check back later.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const { accessToken, refreshToken, refreshTokenId } = await this.jwtTokenService.generateTokenPair(
      {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
        tenantId: user.tenant?.tenantId,
      },
      'email_password' satisfies AuthMethod,
    );
    await this.loginEventService.recordSuccess({
      userId: user.id,
      tenantId: user.tenant?.id ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      sessionId: refreshTokenId,
    });
    return {
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenant?.tenantId,
        tenantName: user.tenant?.companyName,
        tenantTimezone: user.tenant?.timezone ?? undefined,
        subdomain: user.tenant?.subdomain ?? undefined,
      },
    };
  }

  async loginWithPhone(dto: PhoneLoginDto): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone, isActive: true },
      include: { tenant: true },
    });
    if (!user || !user.phoneVerified) throw new UnauthorizedException('Invalid phone or PIN');
    // Null-safe: tenant-less users (single-tenant mode) have user.tenant = null
    if (user.tenant && !user.tenant.isActive) throw new UnauthorizedException('Account is not active');
    if (!user.pinHash) throw new UnauthorizedException('Invalid phone or PIN');
    const isPinValid = await this.pinService.verifyPin(dto.pin, user.pinHash);
    if (!isPinValid) throw new UnauthorizedException('Invalid phone or PIN');
    const tokens = await this.jwtTokenService.generateTokenPair(
      {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
        tenantId: user.tenant?.tenantId,
      },
      'phone_pin' satisfies AuthMethod,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toUserProfile(user),
    };
  }

  async sendPhoneOtp(phone: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { phone, isActive: true },
    });
    if (!user) return; // Don't reveal if phone exists
    await this.twilioVerifyService.sendVerification(phone);
  }

  async loginWithOtp(dto: VerifyOtpDto): Promise<any> {
    const isValid = await this.twilioVerifyService.checkVerification(dto.phone, dto.code);
    if (!isValid) throw new UnauthorizedException('Invalid or expired verification code');
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone, isActive: true },
      include: { tenant: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.tenant && (user.tenant.status !== 'ACTIVE' || !user.tenant.isActive)) {
      throw new UnauthorizedException('Your organization account is pending approval. Please check back later.');
    }
    if (!user.phoneVerified)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    const tokens = await this.jwtTokenService.generateTokenPair(
      {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
        tenantId: user.tenant?.tenantId,
      },
      'phone_otp' satisfies AuthMethod,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toUserProfile(user),
      requiresPinSetup: !user.pinHash,
    };
  }

  async setPin(userId: string, pin: string): Promise<void> {
    const pinHash = await this.pinService.hashPin(pin);
    await this.prisma.user.update({ where: { userId }, data: { pinHash } });
  }

  async addPhone(userId: string, phone: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({ where: { phone } });
    if (existing && existing.userId !== userId) throw new ConflictException('This phone number is already in use');
    try {
      await this.prisma.user.update({
        where: { userId },
        data: { phone, phoneVerified: false },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('This phone number is already in use');
      throw err;
    }
    try {
      await this.twilioVerifyService.sendVerification(phone);
    } catch (err) {
      // Roll back phone so the user can retry cleanly
      await this.prisma.user.update({
        where: { userId },
        data: { phone: null, phoneVerified: false },
      });
      throw err;
    }
  }

  async verifyAndAddPhone(userId: string, phone: string, code: string): Promise<void> {
    const isValid = await this.twilioVerifyService.checkVerification(phone, code);
    if (!isValid) throw new UnauthorizedException('Invalid or expired verification code');
    await this.prisma.user.update({
      where: { userId },
      data: { phoneVerified: true },
    });
  }

  async generateTokensForUser(user: any): Promise<any> {
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { tenant: true },
    });
    if (!fullUser) throw new NotFoundException('User not found');
    const tokens = await this.jwtTokenService.generateTokenPair({
      id: fullUser.id,
      userId: fullUser.userId,
      email: fullUser.email,
      role: fullUser.role,
      tenantId: fullUser.tenant?.tenantId,
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toUserProfile(fullUser),
    };
  }

  private toUserProfile(user: any): UserProfileDto {
    return {
      dbId: user.id,
      userId: user.userId,
      email: user.email,
      emailVerified: user.emailVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenant?.tenantId,
      tenantName: user.tenant?.companyName,
      tenantTimezone: user.tenant?.timezone ?? undefined,
      subdomain: user.tenant?.subdomain ?? undefined,
      isActive: user.isActive,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      hasPinSet: !!user.pinHash,
      createdAt: user.createdAt?.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString(),
    };
  }
}
