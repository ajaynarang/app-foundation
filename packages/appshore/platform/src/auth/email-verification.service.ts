import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ApiErrorCode, AuthErrorCode } from '@app/shared-types';
import { toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { EmailService } from '../infrastructure/notification/services/email.service';
import { EMAIL_VERIFICATION_RESEND_COOLDOWN_MS, EMAIL_VERIFICATION_TTL_MS } from '../constants';
import { hashToken } from './token-hash';

/** Why a verification email went out: shapes the copy, never the token. */
export type VerificationReason = 'signup' | 'resend' | 'invitation';

/** The account a verification email is for. */
export interface VerificationUser {
  id: number;
  email: string | null;
  firstName: string;
  emailVerified: boolean;
}

/** 429 for a resend inside the cooldown. `retryAfterSeconds` goes in the `Retry-After` header. */
export class VerificationResendCooldownException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        code: ApiErrorCode.RATE_LIMITED,
        detail: 'A verification email was just sent. Wait a minute before asking again.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Email verification (ADR-0012: the token is stored only as sha256). An address counts as proven when the signed-in
 * owner of the account opens the link sent to it (D8): the token alone is not enough, because the mailbox owner may
 * not be the person who created the account (a pre-hijack). The emailed message goes through `EmailService`
 * directly, like a password reset, never the `notifications` pipeline: a credential is not queued, retried or stored.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a token and email the link. A no-op for an account with no email or one already verified. A send
   * failure is logged without the link and never thrown: signup must not fail because mail is down.
   */
  async issue(user: VerificationUser, { reason }: { reason: VerificationReason }): Promise<void> {
    if (!user.email || user.emailVerified) return;
    const email = user.email.toLowerCase().trim();
    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        email,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;
    const intro =
      reason === 'invitation'
        ? 'You joined a workspace with this email address.'
        : reason === 'resend'
          ? 'Here is a new link to verify your email address.'
          : 'Thanks for signing up.';
    try {
      await this.emailService.sendEmail({
        to: email,
        subject: 'Verify your email',
        html: `<p>Hi ${user.firstName},</p><p>${intro} Confirm it is yours (the link works for 24 hours; sign in first if you are asked to):</p><p><a href="${verifyUrl}">Verify your email</a></p><p>If you did not create this account, ignore this email. To take the address back, use "Forgot password" on the sign-in page.</p>`,
        text: `Hi ${user.firstName},\n\n${intro} Verify your email (works for 24 hours; sign in first if asked): ${verifyUrl}\n\nIf you did not create this account, ignore this email. To take the address back, use "Forgot password".`,
      });
    } catch (err) {
      // Never the link: it is a live credential. With no provider on a developer's machine the email service has
      // already printed the message, link included (ENV_TYPE=development console mode).
      this.logger.warn({ msg: 'Verification email was not sent', userId: user.id, err: toLoggableError(err) });
    }
  }

  /**
   * Use a verification link. `callerUserDbId` is the signed-in user: the token must be theirs (D8). Every refusal is
   * the same 400 `VERIFICATION_LINK_INVALID`, so the route cannot test tokens or tell whose a token is. Not 401: the
   * caller is signed in, and the web treats a 401 as an expired session.
   */
  async verify(rawToken: string, callerUserDbId: number): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { id: true, email: true, deletedAt: true } } },
      });
      if (
        !record ||
        record.userId !== callerUserDbId ||
        record.usedAt ||
        record.expiresAt <= now ||
        record.user.deletedAt ||
        !record.user.email ||
        record.user.email.toLowerCase().trim() !== record.email.toLowerCase()
      ) {
        throw invalidLink();
      }
      // Conditional: of two concurrent clicks, only one moves the row.
      const used = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (used.count !== 1) throw invalidLink();
      await tx.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
      await tx.emailVerificationToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
    });
  }

  /** Send a new link to the signed-in user. A no-op when already verified; 429 inside the 60-second cooldown. */
  async resend(userDbId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userDbId },
      select: { id: true, email: true, firstName: true, emailVerified: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.emailVerified || !user.email) return;
    const newest = await this.prisma.emailVerificationToken.findFirst({
      where: { userId: userDbId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (newest) {
      const waitMs = newest.createdAt.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - Date.now();
      if (waitMs > 0) throw new VerificationResendCooldownException(Math.max(1, Math.ceil(waitMs / 1000)));
    }
    await this.issue(user, { reason: 'resend' });
  }
}

function invalidLink(): BadRequestException {
  return new BadRequestException({
    code: AuthErrorCode.VERIFICATION_LINK_INVALID,
    detail: 'This verification link is invalid or has expired.',
  });
}
