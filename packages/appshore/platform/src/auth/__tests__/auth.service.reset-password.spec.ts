import * as crypto from 'crypto';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { JwtTokenService } from '../jwt.service';
import { FirebaseAuthService } from '../firebase-auth.service';
import { PinService } from '../pin.service';
import { TwilioVerifyService } from '../../infrastructure/sms/twilio-verify.service';
import { LoginEventService } from '../login-event.service';
import { EmailService } from '../../infrastructure/notification/services/email.service';
import { IdentityResolverService } from '../identity-resolver.service';
import { EmailVerificationService } from '../email-verification.service';

/**
 * `resetPassword` writes the new hash, consumes the token, marks the email verified and revokes every session in one
 * interactive transaction: every write goes through the `tx` client the callback receives, never the root client
 * (array transactions are banned, `rls-no-array-transaction.spec.ts`). A reset of an account whose email was not
 * verified is a reclaim (D9): it removes every other credential the account's creator could have attached.
 */
describe('AuthService.resetPassword', () => {
  const tx = {
    user: { update: jest.fn(), findUnique: jest.fn() },
    passwordResetToken: { updateMany: jest.fn() },
    emailVerificationToken: { updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    apiKey: { updateMany: jest.fn() },
    oAuthAccessToken: { updateMany: jest.fn() },
    oAuthRefreshToken: { updateMany: jest.fn() },
    oAuthAuthorizationCode: { updateMany: jest.fn() },
    pushSubscription: { deleteMany: jest.fn() },
    notificationDevice: { deleteMany: jest.fn() },
  };
  const prisma = {
    passwordResetToken: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    apiKey: { updateMany: jest.fn() },
    $transaction: jest.fn(async (fn: unknown) => {
      if (typeof fn !== 'function') throw new TypeError('expected an interactive transaction callback');
      return fn(tx);
    }),
  };
  const emailService = { sendEmail: jest.fn() };
  let service: AuthService;

  const verifiedUser = {
    email: 'pat@example.com',
    firstName: 'Pat',
    emailVerified: true,
    phone: '+15550001111',
    pinHash: 'pin-hash',
    firebaseUid: 'fb-uid',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    tx.apiKey.updateMany.mockResolvedValue({ count: 2 });
    tx.oAuthAccessToken.updateMany.mockResolvedValue({ count: 1 });
    tx.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 0 });
    tx.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
    tx.notificationDevice.deleteMany.mockResolvedValue({ count: 1 });
    tx.user.findUnique.mockResolvedValue(verifiedUser);
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 7,
      userId: 42,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtTokenService, useValue: {} },
        { provide: FirebaseAuthService, useValue: {} },
        { provide: PinService, useValue: {} },
        { provide: TwilioVerifyService, useValue: {} },
        { provide: LoginEventService, useValue: {} },
        { provide: EmailService, useValue: emailService },
        { provide: EmailVerificationService, useValue: { issue: jest.fn() } },
        IdentityResolverService,
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('writes the hash, consumes the token, verifies the email and revokes sessions on the transaction client', async () => {
    const token = 'reset-token';

    await service.resetPassword({ token, newPassword: 'N3w-Password!' });

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.passwordResetToken.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 7, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { passwordHash: expect.any(String), passwordChangedAt: expect.any(Date), emailVerified: true },
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, isRevoked: false },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("uses up the user's other unused reset and verification tokens", async () => {
    await service.resetPassword({ token: 'reset-token', newPassword: 'N3w-Password!' });

    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('a reset of a verified account leaves its phone, PIN, Firebase link, API keys, OAuth and push devices alone', async () => {
    await service.resetPassword({ token: 'reset-token', newPassword: 'N3w-Password!' });

    const data = tx.user.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('phone');
    expect(data).not.toHaveProperty('pinHash');
    expect(data).not.toHaveProperty('firebaseUid');
    expect(tx.apiKey.updateMany).not.toHaveBeenCalled();
    expect(tx.oAuthAccessToken.updateMany).not.toHaveBeenCalled();
    expect(tx.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled();
    expect(tx.pushSubscription.deleteMany).not.toHaveBeenCalled();
    expect(tx.notificationDevice.deleteMany).not.toHaveBeenCalled();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('a reset of an unverified account is a reclaim: it removes every other credential and sends the notice', async () => {
    tx.user.findUnique.mockResolvedValue({ ...verifiedUser, emailVerified: false });

    await service.resetPassword({ token: 'reset-token', newPassword: 'N3w-Password!' });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        passwordHash: expect.any(String),
        passwordChangedAt: expect.any(Date),
        emailVerified: true,
        phone: null,
        phoneVerified: false,
        pinHash: null,
        firebaseUid: null,
      },
    });
    expect(tx.apiKey.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, revokedAt: null },
      data: { revokedAt: expect.any(Date), isActive: false },
    });
    expect(tx.oAuthAccessToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // A code got just before the reset could still be exchanged for fresh tokens within its 10-minute life.
    expect(tx.oAuthAuthorizationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    // Push goes to every device of the user: the creator's browser or phone must stop getting the owner's alerts.
    expect(tx.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 42 } });
    expect(tx.notificationDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: 42 } });
    expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const notice = emailService.sendEmail.mock.calls[0][0];
    expect(notice.to).toBe('pat@example.com');
    expect(notice.text).toContain('Sign-in methods we removed:');
    expect(notice.text).toContain('phone number and PIN sign-in');
    expect(notice.text).toContain('Firebase');
    expect(notice.text).toContain('2 API keys');
    expect(notice.text).toContain('connected apps (OAuth)');
    expect(notice.text).toContain('push notifications on other devices');
  });

  it('a reclaim counts an unexchanged OAuth code as connected-app access', async () => {
    tx.user.findUnique.mockResolvedValue({ ...verifiedUser, emailVerified: false });
    tx.oAuthAccessToken.updateMany.mockResolvedValue({ count: 0 });
    tx.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 0 });
    tx.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
    tx.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    tx.notificationDevice.deleteMany.mockResolvedValue({ count: 0 });

    await service.resetPassword({ token: 'reset-token', newPassword: 'N3w-Password!' });

    const notice = emailService.sendEmail.mock.calls[0][0];
    expect(notice.text).toContain('connected apps (OAuth)');
    expect(notice.text).not.toContain('push notifications');
  });

  it('the reclaim notice is sent after the commit, and a send failure does not fail the reset', async () => {
    tx.user.findUnique.mockResolvedValue({ ...verifiedUser, emailVerified: false });
    const order: string[] = [];
    prisma.$transaction.mockImplementationOnce(async (fn: unknown) => {
      const out = await (fn as (t: typeof tx) => Promise<unknown>)(tx);
      order.push('commit');
      return out;
    });
    emailService.sendEmail.mockImplementationOnce(async () => {
      order.push('notice');
      throw new Error('smtp down');
    });

    await expect(
      service.resetPassword({ token: 'reset-token', newPassword: 'N3w-Password!' }),
    ).resolves.toBeUndefined();
    expect(order).toEqual(['commit', 'notice']);
  });

  it('refuses a used token and writes nothing', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 7,
      userId: 42,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.resetPassword({ token: 'x', newPassword: 'N3w-Password!' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('of two concurrent resets with one link, the one whose conditional update lost writes nothing', async () => {
    tx.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.resetPassword({ token: 'x', newPassword: 'N3w-Password!' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
