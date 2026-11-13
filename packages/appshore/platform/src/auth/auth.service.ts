import {
  Inject,
  Injectable,
  Logger,
  Optional,
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
import { VerifyOtpLoginDto } from './dto/verify-otp.dto';
import { LoginEventService } from './login-event.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TENANT_PROVISION_HOOKS, type TenantProvisionHooks } from '../domains/platform-hooks';
import { toUserProfile } from './user-profile';
import { IdentityResolverService, type LoginAccount } from './identity-resolver.service';
import { ApiErrorCode, type WorkspaceChoice } from '@app/shared-types';
import { toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';

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
    private identityResolver: IdentityResolverService,
    @Optional() @Inject(TENANT_PROVISION_HOOKS) private readonly provisionHooks?: TenantProvisionHooks,
  ) {}

  private static readonly PASSWORD_SALT_ROUNDS = 12;
  private static readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

  /** Sign out one session: `sessionId` is the access token's `sid`, the refresh-token family. */
  async logout(sessionId: string, userId: number, tenantId: number | null): Promise<void> {
    await this.jwtTokenService.revokeFamily(sessionId);
    await this.loginEventService.recordLogout({
      userId,
      tenantId,
      sessionId,
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

  /** `currentSessionId` is the access token's `sid` (the refresh-token family); other sessions are other families. */
  async recordPasswordChange(
    userId: string,
    currentSessionId: string | null,
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
          ...(currentSessionId ? { familyId: { not: currentSessionId } } : {}),
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
   *
   * Tenant-aware: one email can still have several live accounts (rows from before one-account-per-email), so the
   * password is checked against every one that passes the hint (`dto.tenantId`, the tenant's public id). Exactly one
   * match signs in. Several matches answer 409 `WORKSPACE_SELECTION_REQUIRED` with the workspaces, and the client
   * retries with one `tenantId`; the list is shown only after the password matched, so it reveals nothing. The
   * session runs in the hinted workspace, else the account's login default.
   */
  async loginWithPassword(dto: PasswordLoginDto, meta: { ip: string | null; userAgent: string | null }) {
    const email = dto.email.toLowerCase().trim();
    const candidates = await this.identityResolver.findEmailAccounts(email, dto.tenantId);
    if (candidates.length === 0) throw new UnauthorizedException('Invalid email or password');
    const withPassword = candidates.filter((candidate) => candidate.user.passwordHash);
    if (withPassword.length === 0) {
      // Account exists but authenticates via Firebase/phone. The web client
      // uses this code to fall back to the Firebase flow when configured.
      throw new UnauthorizedException({
        message: 'This account does not use password sign-in.',
        code: 'PASSWORD_NOT_SET',
      });
    }

    const matched: LoginAccount[] = [];
    for (const candidate of withPassword) {
      if (await bcrypt.compare(dto.password, candidate.user.passwordHash!)) matched.push(candidate);
    }
    if (matched.length === 0) {
      for (const candidate of withPassword) {
        await this.loginEventService.recordFailure({
          userId: candidate.user.id,
          tenantId: candidate.tenant?.id ?? null,
          ip: meta.ip,
          userAgent: meta.userAgent,
          failReason: 'invalid_credentials' as const,
        });
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    const account = this.pickMatchedAccount(matched, Boolean(dto.tenantId));
    const { user, tenant, role } = account;
    if (!user.isActive) {
      await this.loginEventService.recordFailure({
        userId: user.id,
        tenantId: tenant?.id ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'account_disabled' as const,
      });
      throw new UnauthorizedException('Account is deactivated. Please contact support.');
    }
    if (tenant && (tenant.status !== 'ACTIVE' || !tenant.isActive)) {
      await this.loginEventService.recordFailure({
        userId: user.id,
        tenantId: tenant.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'tenant_inactive' as const,
      });
      throw new UnauthorizedException('Your organization account is pending approval. Please check back later.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { accessToken, refreshToken, refreshTokenId } = await this.jwtTokenService.generateTokenPair(
      this.sessionUserOf(account),
      'email_password' satisfies AuthMethod,
    );
    await this.loginEventService.recordSuccess({
      userId: user.id,
      tenantId: tenant?.id ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      sessionId: refreshTokenId,
    });
    return { accessToken, refreshToken, user: this.toUserProfile({ ...user, role, tenant }) };
  }

  /**
   * One account out of several password matches. With a hint every match is already in the hinted workspace, so
   * the account whose own workspace it is wins, else the oldest; there is nothing left for the client to choose.
   * Without a hint, matches in more than one workspace are the client's choice (409).
   */
  private pickMatchedAccount(matched: LoginAccount[], hinted: boolean): LoginAccount {
    if (matched.length === 1) return matched[0];
    if (hinted) return matched.find((m) => m.user.tenantId === m.tenant?.id) ?? matched[0];

    const workspaces: WorkspaceChoice[] = [];
    for (const { tenant } of matched) {
      if (tenant && !workspaces.some((w) => w.tenantId === tenant.tenantId)) {
        workspaces.push({ tenantId: tenant.tenantId, name: tenant.companyName });
      }
    }
    if (workspaces.length < 2) return matched.find((m) => m.tenant) ?? matched[0];
    throw new ConflictException({
      code: ApiErrorCode.WORKSPACE_SELECTION_REQUIRED,
      detail: 'This email signs in to more than one workspace. Choose the one you want.',
      workspaces,
    });
  }

  /** The claims a new session carries: the account, in the workspace and role it resolved to. */
  private sessionUserOf({ user, tenant, role }: LoginAccount) {
    return {
      id: user.id,
      userId: user.userId,
      email: user.email,
      role,
      tenantId: tenant?.tenantId,
      tenantDbId: tenant?.id ?? null,
    };
  }

  /**
   * Forgot-password: always resolves 200 (no account enumeration). Stores a
   * SHA-256 hash of a one-time token; the raw token goes into the emailed
   * link. With no email provider on a developer's machine (ENV_TYPE=development) the email service prints the
   * message, link included; anywhere else the send fails and the link is never logged.
   *
   * One token and one email for each live, active account behind the address (after the hint). With more than one,
   * each email names its workspace so the reader knows which account the link resets.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = dto.email.toLowerCase().trim();
    const accounts = await this.identityResolver.findEmailAccounts(email, dto.tenantId, { activeOnly: true });
    const nameWorkspace = accounts.length > 1;
    for (const { user, tenant } of accounts) {
      await this.sendPasswordReset(user, email, nameWorkspace ? tenant?.companyName : undefined);
    }
  }

  private async sendPasswordReset(user: { id: number; firstName: string }, email: string, workspace?: string) {
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
    const forAccount = workspace ? ` in the ${workspace} workspace` : '';
    try {
      await this.emailService.sendEmail({
        to: email,
        subject: workspace ? `Reset your password for ${workspace}` : 'Reset your password',
        html: `<p>Hi ${user.firstName},</p><p>Someone requested a password reset for your account${forAccount}. This link expires in 1 hour:</p><p><a href="${resetUrl}">Reset your password</a></p><p>If this wasn't you, you can safely ignore this email.</p>`,
        text: `Hi ${user.firstName},\n\nReset your password for your account${forAccount} (expires in 1 hour): ${resetUrl}\n\nIf this wasn't you, ignore this email.`,
      });
    } catch (err) {
      // Never the link: it is a live credential. On a developer's machine with no provider the email service has
      // already printed the message, link included (ENV_TYPE=development console mode).
      this.logger.warn({ msg: 'Password reset email was not sent', err: toLoggableError(err) });
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

  /**
   * Personal-mode signup: every user gets their own workspace, created and
   * activated immediately (no approval step, no org concepts). Gated by the
   * controller to TENANCY_MODE=personal.
   */
  async registerPersonal(
    dto: { email: string; password: string; firstName: string; lastName: string },
    meta: { ip: string | null; userAgent: string | null },
  ) {
    const email = dto.email.toLowerCase().trim();
    // In any case: stored addresses are not all lowercase, and the database holds one live account per lower(email).
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) throw new ConflictException('An account with this email already exists');
    const passwordHash = await bcrypt.hash(dto.password, AuthService.PASSWORD_SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          tenantId: `ws_${crypto.randomUUID().slice(0, 12)}`,
          companyName: `${dto.firstName}'s Workspace`,
          status: 'ACTIVE',
          isActive: true,
          plan: 'STARTER',
          timezone: 'UTC',
        },
      });
      const created = await tx.user.create({
        data: {
          userId: `user_${crypto.randomUUID().slice(0, 18)}`,
          tenantId: tenant.id,
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'OWNER',
          isActive: true,
          emailVerified: false,
        },
        include: { tenant: true },
      });
      await tx.workspaceMember.create({
        data: { userId: created.id, tenantId: tenant.id, role: 'OWNER', isDefault: true },
      });
      await tx.userPreferences.create({ data: { userId: created.id } });
      return created;
    });

    // The workspace is ACTIVE with no approval step, so it gets what an approved one gets (its AI budget, and any
    // feature's provisioning), after the signup committed. A hook failure is logged and never fails the signup.
    if (user.tenantId !== null) {
      try {
        await this.provisionHooks?.tenantApproved(user.tenantId);
      } catch (err) {
        this.logger.warn(
          `tenantApproved hook failed for personal workspace ${user.tenantId}: ${(err as Error).message}`,
        );
      }
    }

    const { accessToken, refreshToken, refreshTokenId } = await this.jwtTokenService.generateTokenPair(
      {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
        tenantId: user.tenant?.tenantId,
        tenantDbId: user.tenant?.id ?? null,
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
        tenantDbId: user.tenant?.id ?? null,
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

  /** PIN sign-in. A phone number is unique, so at most one account; the hint only picks the session's workspace. */
  async loginWithPhone(dto: PhoneLoginDto): Promise<any> {
    const account = await this.identityResolver.findPhoneAccount(dto.phone, dto.tenantId);
    if (!account || !account.user.phoneVerified) throw new UnauthorizedException('Invalid phone or PIN');
    const { user, tenant, role } = account;
    // Null-safe: tenant-less users (single-tenant mode) have no tenant
    if (tenant && !tenant.isActive) throw new UnauthorizedException('Account is not active');
    if (!user.pinHash) throw new UnauthorizedException('Invalid phone or PIN');
    const isPinValid = await this.pinService.verifyPin(dto.pin, user.pinHash);
    if (!isPinValid) throw new UnauthorizedException('Invalid phone or PIN');
    const tokens = await this.jwtTokenService.generateTokenPair(
      this.sessionUserOf(account),
      'phone_pin' satisfies AuthMethod,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toUserProfile({ ...user, role, tenant }),
    };
  }

  /** Sends nothing (and says nothing) when no account on the number passes the hint. */
  async sendPhoneOtp(phone: string, tenantId?: string): Promise<void> {
    const account = await this.identityResolver.findPhoneAccount(phone, tenantId);
    if (!account) return; // Don't reveal if phone exists
    await this.twilioVerifyService.sendVerification(phone);
  }

  async loginWithOtp(dto: VerifyOtpLoginDto): Promise<any> {
    const isValid = await this.twilioVerifyService.checkVerification(dto.phone, dto.code);
    if (!isValid) throw new UnauthorizedException('Invalid or expired verification code');
    const account = await this.identityResolver.findPhoneAccount(dto.phone, dto.tenantId);
    if (!account) throw new UnauthorizedException('User not found');
    const { user, tenant, role } = account;
    if (tenant && (tenant.status !== 'ACTIVE' || !tenant.isActive)) {
      throw new UnauthorizedException('Your organization account is pending approval. Please check back later.');
    }
    if (!user.phoneVerified)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    const tokens = await this.jwtTokenService.generateTokenPair(
      this.sessionUserOf(account),
      'phone_otp' satisfies AuthMethod,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toUserProfile({ ...user, role, tenant }),
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
      tenantDbId: fullUser.tenant?.id ?? null,
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toUserProfile(fullUser),
    };
  }

  private toUserProfile(user: any): UserProfileDto {
    return toUserProfile(user);
  }
}
