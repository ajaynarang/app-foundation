import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { NotificationType } from '@appshore/db';
import { PrismaService } from '../../../../database/prisma.service';
import { FeatureFlagsService } from '../../../../../domains/feature-flags/feature-flags.service';
import { ConfigService } from '@nestjs/config';
import { AppCacheService } from '../../../../cache/app-cache.service';
import { DeliveryLedgerService } from '../../../pipeline/delivery-ledger.service';
import { WhatsAppSendHandler, dailySendCounterKey, type WhatsAppSendJobPayload } from '../whatsapp-send.handler';
import { WHATSAPP_PORT, WhatsAppSendError } from '../whatsapp.port';

describe('WhatsAppSendHandler', () => {
  let handler: WhatsAppSendHandler;
  const prisma = {
    notificationDelivery: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn() },
  };
  const ledger = {
    markSent: jest.fn(),
    markFailed: jest.fn(),
    markSkipped: jest.fn(),
    claimSend: jest.fn().mockResolvedValue(true),
    releaseClaim: jest.fn(),
  };
  const whatsapp = { sendTemplate: jest.fn() };
  const featureFlags = { isEnabled: jest.fn().mockResolvedValue(true) };
  const cache = { increment: jest.fn().mockResolvedValue(1) };
  const config = { get: jest.fn().mockReturnValue(undefined) };

  const payload: WhatsAppSendJobPayload = {
    deliveryId: 'd1',
    userId: 7,
    type: NotificationType.INTEGRATION_SYNC_COMPLETED,
    send: { templateName: 'tx_draw_published_v1', languageCode: 'en', bodyValues: ['x', 'c'] },
  };
  const job = (attemptsMade = 0, attempts = 5): Job<JobEnvelope<WhatsAppSendJobPayload>> =>
    ({
      id: 'whatsapp-d1',
      name: 'whatsapp-send',
      data: { tenantId: '1', correlationId: 'c', payload, metadata: { enqueuedAt: '', source: 'event', version: 1 } },
      attemptsMade,
      opts: { attempts },
    }) as unknown as Job<JobEnvelope<WhatsAppSendJobPayload>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WhatsAppSendHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveryLedgerService, useValue: ledger },
        { provide: WHATSAPP_PORT, useValue: whatsapp },
        { provide: FeatureFlagsService, useValue: featureFlags },
        { provide: AppCacheService, useValue: cache },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    handler = module.get(WhatsAppSendHandler);
    jest.clearAllMocks();
    featureFlags.isEnabled.mockResolvedValue(true);
    ledger.claimSend.mockResolvedValue(true);
    cache.increment.mockResolvedValue(1);
    config.get.mockReturnValue(undefined);
    prisma.notificationDelivery.findUnique.mockResolvedValue({ status: 'QUEUED', attemptCount: 1 });
    prisma.user.findUnique.mockResolvedValue({ phone: '+919876543210' });
  });

  it('answers to its job name and no other', () => {
    expect(handler.jobNames).toEqual(['whatsapp-send']);
  });

  it('sends once and marks SENT with the provider id and the attempt number', async () => {
    whatsapp.sendTemplate.mockResolvedValue({ providerMessageId: 'im_1' });

    await handler.run(job());

    expect(whatsapp.sendTemplate).toHaveBeenCalledWith({
      to: '+919876543210',
      templateName: 'tx_draw_published_v1',
      languageCode: 'en',
      bodyValues: ['x', 'c'],
      callbackData: 'd1',
    });
    expect(ledger.markSent).toHaveBeenCalledWith('d1', 'im_1', 1);
  });

  it('a redelivered job for a row that is no longer QUEUED sends nothing', async () => {
    prisma.notificationDelivery.findUnique.mockResolvedValue({ status: 'SENT', attemptCount: 1 });
    await handler.run(job());
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(ledger.markSent).not.toHaveBeenCalled();
  });

  it('a missing row (the ledger write was lost) sends nothing and does not retry', async () => {
    prisma.notificationDelivery.findUnique.mockResolvedValue(null);
    await expect(handler.run(job())).resolves.toBeUndefined();
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  it('the flag turned off between enqueue and send → SKIPPED/FLAG_OFF', async () => {
    featureFlags.isEnabled.mockResolvedValue(false);
    await handler.run(job());
    expect(ledger.markSkipped).toHaveBeenCalledWith('d1', 'FLAG_OFF');
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  it('the user lost their phone between enqueue and send → SKIPPED/NO_ADDRESS', async () => {
    prisma.user.findUnique.mockResolvedValue({ phone: null });
    await handler.run(job());
    expect(ledger.markSkipped).toHaveBeenCalledWith('d1', 'NO_ADDRESS');
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  it('a retryable provider error bumps attemptCount and rethrows so BullMQ retries', async () => {
    whatsapp.sendTemplate.mockRejectedValue(new WhatsAppSendError('Interakt 429', true));

    await expect(handler.run(job(0, 5))).rejects.toThrow(/429/);

    expect(ledger.releaseClaim).toHaveBeenCalledWith('d1', 2);
    expect(ledger.markFailed).not.toHaveBeenCalled();
  });

  it('a retryable error on the LAST attempt marks FAILED and stops', async () => {
    whatsapp.sendTemplate.mockRejectedValue(new WhatsAppSendError('Interakt 503', true));

    await expect(handler.run(job(4, 5))).resolves.toBeUndefined();

    expect(ledger.markFailed).toHaveBeenCalledWith('d1', 'PROVIDER_ERROR', 5);
    expect(ledger.releaseClaim).not.toHaveBeenCalled();
  });

  it('a non-retryable error marks FAILED immediately, whatever the attempt', async () => {
    whatsapp.sendTemplate.mockRejectedValue(new WhatsAppSendError('Interakt 400', false));

    await expect(handler.run(job(0, 5))).resolves.toBeUndefined();

    expect(ledger.markFailed).toHaveBeenCalledWith('d1', 'PROVIDER_ERROR', 1);
  });

  it("a provider that names the reason (Meta's marketing cap) gets that reason on the row, not PROVIDER_ERROR", async () => {
    whatsapp.sendTemplate.mockRejectedValue(new WhatsAppSendError('Meta 400 (131049)', false, 'MARKETING_CAP'));
    await expect(handler.run(job(0, 5))).resolves.toBeUndefined();
    expect(ledger.markFailed).toHaveBeenCalledWith('d1', 'MARKETING_CAP', 1);
  });

  it('an unexpected (non-WhatsAppSendError) failure is treated as final — no blind retry loop', async () => {
    whatsapp.sendTemplate.mockRejectedValue(new TypeError('boom'));
    await expect(handler.run(job(0, 5))).resolves.toBeUndefined();
    expect(ledger.markFailed).toHaveBeenCalledWith('d1', 'PROVIDER_ERROR', 1);
  });
  it('claims the row BEFORE calling the provider, with the attempt number', async () => {
    whatsapp.sendTemplate.mockResolvedValue({ providerMessageId: 'im_1' });
    await handler.run(job(1, 5));
    expect(ledger.claimSend).toHaveBeenCalledWith('d1', 2);
    expect(ledger.claimSend.mock.invocationCallOrder[0]).toBeLessThan(
      whatsapp.sendTemplate.mock.invocationCallOrder[0],
    );
  });

  it('a job redelivered after a crash mid-send finds the claim and does NOT send again', async () => {
    // Row still QUEUED (markSent never landed) but sentAt is set: the provider may have it.
    ledger.claimSend.mockResolvedValue(false);
    await expect(handler.run(job(1, 5))).resolves.toBeUndefined();
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(ledger.markSent).not.toHaveBeenCalled();
    expect(ledger.markFailed).not.toHaveBeenCalled();
  });
  describe('the daily ceiling', () => {
    it("counts every attempted send against the platform's IST day, before claiming", async () => {
      whatsapp.sendTemplate.mockResolvedValue({ providerMessageId: 'im_1' });
      await handler.run(job());
      const [key, cost, ttl] = cache.increment.mock.calls[0];
      expect(key).toMatch(/^whatsapp:sends:\d{4}-\d{2}-\d{2}$/);
      expect(cost).toBe(1);
      expect(ttl).toBe(172_800);
      expect(cache.increment.mock.invocationCallOrder[0]).toBeLessThan(ledger.claimSend.mock.invocationCallOrder[0]);
    });

    it('the key rolls over at midnight in the bound platform zone, not UTC', () => {
      // 23:30 UTC on the 31st is 05:00 IST on the 1st.
      expect(dailySendCounterKey(new Date('2026-08-31T23:30:00Z'), 'Asia/Kolkata')).toBe('whatsapp:sends:2026-09-01');
      expect(dailySendCounterKey(new Date('2026-08-31T23:30:00Z'), 'UTC')).toBe('whatsapp:sends:2026-08-31');
    });

    it('over the ceiling → SKIPPED/CEILING, no claim, no send', async () => {
      cache.increment.mockResolvedValue(5001);
      await handler.run(job());
      expect(ledger.markSkipped).toHaveBeenCalledWith('d1', 'CEILING');
      expect(ledger.claimSend).not.toHaveBeenCalled();
      expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    });

    it('a retry is the same message — it is not charged again and the ceiling does not apply to it', async () => {
      whatsapp.sendTemplate.mockResolvedValue({ providerMessageId: 'im_1' });
      cache.increment.mockResolvedValue(9999);
      await handler.run(job(2, 5));
      expect(cache.increment).not.toHaveBeenCalled();
      expect(whatsapp.sendTemplate).toHaveBeenCalled();
    });

    it('a ceiling of ZERO stops everything — the kill switch is honest', async () => {
      config.get.mockReturnValue('0');
      cache.increment.mockResolvedValue(1);
      await handler.run(job());
      expect(ledger.markSkipped).toHaveBeenCalledWith('d1', 'CEILING');
      expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    });

    it('a malformed env value falls back to the default', async () => {
      config.get.mockReturnValue('lots');
      cache.increment.mockResolvedValue(5000);
      whatsapp.sendTemplate.mockResolvedValue({ providerMessageId: 'im_1' });
      await handler.run(job());
      expect(whatsapp.sendTemplate).toHaveBeenCalled();
    });

    it('exactly at the ceiling still sends; the env var overrides the default', async () => {
      config.get.mockReturnValue('10');
      cache.increment.mockResolvedValue(10);
      whatsapp.sendTemplate.mockResolvedValue({ providerMessageId: 'im_1' });
      await handler.run(job());
      expect(whatsapp.sendTemplate).toHaveBeenCalled();

      jest.clearAllMocks();
      config.get.mockReturnValue('10');
      cache.increment.mockResolvedValue(11);
      prisma.notificationDelivery.findUnique.mockResolvedValue({ status: 'QUEUED', attemptCount: 1 });
      prisma.user.findUnique.mockResolvedValue({ phone: '+919876543210' });
      featureFlags.isEnabled.mockResolvedValue(true);
      await handler.run(job());
      expect(ledger.markSkipped).toHaveBeenCalledWith('d1', 'CEILING');
    });
  });
});
