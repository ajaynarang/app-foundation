import { Logger } from '@nestjs/common';
import { OutboundAllowKind } from '@appshore/db';
import { OUTBOUND_MODE } from '@appshore/kernel/infrastructure/outbound/outbound-mode';
import { OUTBOUND_SOURCE } from '@appshore/kernel/infrastructure/outbound/outbound-gate.port';
import { createOutboundPolicy } from '../testing/outbound-policy.testing';

function prismaWith(entries: Array<{ kind: OutboundAllowKind; value: string }>) {
  return {
    outboundAllowEntry: { findMany: jest.fn().mockResolvedValue(entries) },
    outboundSuppression: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn() },
  };
}

const TEAM = [
  { kind: OutboundAllowKind.EMAIL_DOMAIN, value: 'example.com' },
  { kind: OutboundAllowKind.PHONE, value: '+19785551234' },
  { kind: OutboundAllowKind.HOST, value: 'webhook.site' },
];

const email = { source: OUTBOUND_SOURCE.EMAIL };
const recorded = (prisma: ReturnType<typeof prismaWith>, call = 0) =>
  prisma.outboundSuppression.create.mock.calls[call][0].data;

describe('OutboundPolicyService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('resolves its mode from ENV_TYPE when OUTBOUND_MODE is unset', () => {
    const prisma = prismaWith([]);
    expect(createOutboundPolicy(undefined as never, prisma, { envType: 'production' }).getMode()).toBe('live');
    expect(createOutboundPolicy(undefined as never, prisma, { envType: 'sandbox' }).getMode()).toBe('allowlist');
  });

  describe('live mode', () => {
    it('returns the very same email object and never reads the database', async () => {
      const prisma = prismaWith([]);
      const policy = createOutboundPolicy(OUTBOUND_MODE.LIVE, prisma);
      const message = { to: 'customer@customer.test', cc: ['ap@customer.test'], subject: 'Invoice INV-1' };

      await expect(policy.gateEmail(message, email)).resolves.toBe(message);
      expect(prisma.outboundAllowEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.outboundSuppression.create).not.toHaveBeenCalled();
    });

    it('allows every phone, user, URL and target without a lookup', async () => {
      const prisma = prismaWith([]);
      const policy = createOutboundPolicy(OUTBOUND_MODE.LIVE, prisma);

      await expect(policy.allowPhone('+15550000000', email)).resolves.toBe(true);
      await expect(policy.allowUser(7, email)).resolves.toBe(true);
      await expect(policy.allowUrl('https://x.test', email)).resolves.toBe(true);
      await expect(policy.wouldAllow({ channel: 'push', userId: 7 })).resolves.toBe(true);
      expect(prisma.outboundAllowEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('leaves SMS text and push titles unmarked', () => {
      const policy = createOutboundPolicy(OUTBOUND_MODE.LIVE);
      expect(policy.markSms('Order 12 shipped')).toBe('Order 12 shipped');
      expect(policy.markPushTitle('Order shipped')).toBe('Order shipped');
      expect(policy.isLive()).toBe(true);
    });
  });

  describe('allowlist mode', () => {
    describe('gateEmail', () => {
      it('holds back a recipient not on the list and records it masked', async () => {
        const prisma = prismaWith(TEAM);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        const result = await policy.gateEmail(
          { to: 'Dispatch@customer.test', subject: 'Invoice INV-1' },
          { ...email, tenantId: 4 },
        );

        expect(result).toBeNull();
        expect(recorded(prisma)).toEqual(
          expect.objectContaining({
            channel: 'email',
            recipient: 'd***@customer.test',
            subject: 'Invoice INV-1',
            source: 'email',
            tenantId: 4,
          }),
        );
      });

      it('sends to an allow-listed recipient with a staging subject', async () => {
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prismaWith(TEAM));

        const result = await policy.gateEmail({ to: 'qa@example.com', subject: 'Invoice INV-1', html: '<p/>' }, email);

        expect(result).toEqual({ to: 'qa@example.com', subject: '[STAGING] Invoice INV-1', html: '<p/>' });
      });

      it('drops to, cc and bcc recipients not on the list but keeps the listed ones', async () => {
        const prisma = prismaWith(TEAM);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        const result = await policy.gateEmail(
          {
            to: ['qa@example.com', 'buyer@customer.test'],
            cc: ['ap@customer.test', 'dev@example.com'],
            bcc: ['audit@customer.test'],
            subject: 'S',
          },
          email,
        );

        expect(result).toEqual({ to: ['qa@example.com'], cc: ['dev@example.com'], bcc: [], subject: '[STAGING] S' });
        expect(prisma.outboundSuppression.create).toHaveBeenCalledTimes(3);
      });

      it('holds back the whole email when only a cc is allowed', async () => {
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prismaWith(TEAM));

        await expect(
          policy.gateEmail({ to: 'buyer@customer.test', cc: ['qa@example.com'], subject: 'S' }, email),
        ).resolves.toBeNull();
      });

      it('sends nothing when the allow-list is empty', async () => {
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prismaWith([]));
        await expect(policy.gateEmail({ to: 'qa@example.com', subject: 'S' }, email)).resolves.toBeNull();
      });

      it('fails closed when the allow-list cannot be read', async () => {
        const prisma = prismaWith(TEAM);
        prisma.outboundAllowEntry.findMany.mockRejectedValue(new Error('db down'));
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.gateEmail({ to: 'qa@example.com', subject: 'S' }, email)).resolves.toBeNull();
      });

      it('lets bootstrap entries through when the table cannot be read', async () => {
        const prisma = prismaWith([]);
        prisma.outboundAllowEntry.findMany.mockRejectedValue(new Error('db down'));
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma, { bootstrap: 'first@admin.test' });

        await expect(policy.gateEmail({ to: 'first@admin.test', subject: 'S' }, email)).resolves.not.toBeNull();
      });

      it('still holds back when the row cannot be written', async () => {
        const prisma = prismaWith([]);
        prisma.outboundSuppression.create.mockRejectedValue(new Error('db down'));
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.gateEmail({ to: 'x@customer.test', subject: 'S' }, email)).resolves.toBeNull();
      });

      it('truncates long subjects and sources', async () => {
        const prisma = prismaWith([]);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await policy.gateEmail(
          { to: 'x@customer.test', subject: 's'.repeat(300) },
          { source: 'y'.repeat(100) as never },
        );

        expect(recorded(prisma).subject).toHaveLength(200);
        expect(recorded(prisma).source).toHaveLength(80);
        expect(recorded(prisma).tenantId).toBeNull();
      });
    });

    it('never stores a sign-in code or a link in the held-back row', async () => {
      const prisma = prismaWith([]);
      const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

      await policy.allowPhone('+15550001111', {
        source: OUTBOUND_SOURCE.SMS,
        subject: '785011 is your code, or open https://app.example.com/reset?token=secret',
      });

      expect(recorded(prisma).subject).toBe('•••• is your code, or open [link]');
    });

    it('merges OUTBOUND_ALLOWLIST_BOOTSTRAP into the allow set', async () => {
      const prisma = prismaWith([]);
      const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma, { bootstrap: '+919812345678, @admin.test' });

      await expect(policy.allowPhone('+91 98123 45678', { source: OUTBOUND_SOURCE.SIGN_IN_CODE })).resolves.toBe(true);
      await expect(policy.wouldAllow({ channel: 'email', address: 'first@admin.test' })).resolves.toBe(true);
      expect(policy.bootstrapCount()).toBe(2);
    });

    describe('allow-list cache', () => {
      it('reads the list once within the cache window', async () => {
        const prisma = prismaWith(TEAM);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await policy.allowPhone('+19785551234', email);
        await policy.allowPhone('+19785551234', email);

        expect(prisma.outboundAllowEntry.findMany).toHaveBeenCalledTimes(1);
      });

      it('re-reads the list after invalidate()', async () => {
        const prisma = prismaWith(TEAM);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await policy.allowPhone('+19785551234', email);
        policy.invalidate();
        await policy.allowPhone('+19785551234', email);

        expect(prisma.outboundAllowEntry.findMany).toHaveBeenCalledTimes(2);
      });
    });

    describe('allowPhone', () => {
      it('allows a listed number and records nothing', async () => {
        const prisma = prismaWith(TEAM);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.allowPhone('+1 978 555 1234', { source: OUTBOUND_SOURCE.SMS })).resolves.toBe(true);
        expect(prisma.outboundSuppression.create).not.toHaveBeenCalled();
      });

      it('holds back other numbers, recorded masked', async () => {
        const prisma = prismaWith(TEAM);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.allowPhone('+15550001111', { source: OUTBOUND_SOURCE.SMS })).resolves.toBe(false);
        expect(recorded(prisma)).toMatchObject({ channel: 'sms', recipient: '***1111' });
      });
    });

    describe('allowUser', () => {
      it('allows a user whose email is on the list', async () => {
        const prisma = prismaWith(TEAM);
        prisma.user.findUnique.mockResolvedValue({ email: 'qa@example.com', phone: null });
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.allowUser(1, { source: OUTBOUND_SOURCE.PUSH_FCM })).resolves.toBe(true);
      });

      it('allows a user whose phone is on the list', async () => {
        const prisma = prismaWith(TEAM);
        prisma.user.findUnique.mockResolvedValue({ email: 'someone@gmail.com', phone: '+19785551234' });
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.allowUser(1, { source: OUTBOUND_SOURCE.PUSH_FCM })).resolves.toBe(true);
      });

      it('holds back other users, recorded by masked email', async () => {
        const prisma = prismaWith(TEAM);
        prisma.user.findUnique.mockResolvedValue({ email: 'someone@gmail.com', phone: '+15550001111' });
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.allowUser(1, { source: OUTBOUND_SOURCE.PUSH_WEB, subject: 'Order shipped' })).resolves.toBe(
          false,
        );
        expect(recorded(prisma)).toMatchObject({ channel: 'push', recipient: 's***@gmail.com' });
      });

      it('holds back an unknown user', async () => {
        const prisma = prismaWith(TEAM);
        prisma.user.findUnique.mockResolvedValue(null);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.allowUser(42, { source: OUTBOUND_SOURCE.PUSH_WEB })).resolves.toBe(false);
        expect(recorded(prisma).recipient).toBe('unknown user');
      });
    });

    describe('allowUrl', () => {
      it('allows a listed host', async () => {
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prismaWith(TEAM));
        await expect(
          policy.allowUrl('https://webhook.site/123', { source: OUTBOUND_SOURCE.OUTBOUND_WEBHOOK }),
        ).resolves.toBe(true);
      });

      it('holds back other hosts, recording only the host', async () => {
        const prisma = prismaWith(TEAM);
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(
          policy.allowUrl('https://hooks.customer.test/v1?key=secret', { source: OUTBOUND_SOURCE.OUTBOUND_WEBHOOK }),
        ).resolves.toBe(false);
        expect(recorded(prisma)).toMatchObject({ channel: 'webhook', recipient: 'hooks.customer.test' });
      });
    });

    describe('wouldAllow', () => {
      it('answers for every channel and records nothing', async () => {
        const prisma = prismaWith(TEAM);
        prisma.user.findUnique.mockResolvedValue({ email: 'someone@gmail.com', phone: null });
        const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prisma);

        await expect(policy.wouldAllow({ channel: 'email', address: 'qa@example.com' })).resolves.toBe(true);
        await expect(policy.wouldAllow({ channel: 'email', address: 'x@customer.test' })).resolves.toBe(false);
        await expect(policy.wouldAllow({ channel: 'sms', phone: '+19785551234' })).resolves.toBe(true);
        await expect(policy.wouldAllow({ channel: 'whatsapp', phone: '+15550001111' })).resolves.toBe(false);
        await expect(policy.wouldAllow({ channel: 'push', userId: 3 })).resolves.toBe(false);
        await expect(policy.wouldAllow({ channel: 'webhook', url: 'https://webhook.site/x' })).resolves.toBe(true);
        expect(prisma.outboundSuppression.create).not.toHaveBeenCalled();
      });
    });

    it('marks SMS text and push titles as staging', () => {
      const policy = createOutboundPolicy(OUTBOUND_MODE.ALLOWLIST, prismaWith([]));
      expect(policy.markSms('Order 12 shipped')).toBe('STG: Order 12 shipped');
      expect(policy.markPushTitle('Order shipped')).toBe('[STG] Order shipped');
      expect(policy.isLive()).toBe(false);
    });
  });
});
