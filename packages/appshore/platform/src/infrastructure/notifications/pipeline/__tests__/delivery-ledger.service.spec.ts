import { Test } from '@nestjs/testing';
import { DeliveryChannel, DeliveryStatus, NotificationType } from '@appshore/db';
import { PrismaService } from '../../../database/prisma.service';
import { DeliveryLedgerService } from '../delivery-ledger.service';
import { DELIVERY_SKIP_REASONS } from '../delivery-outcome';

describe('DeliveryLedgerService', () => {
  let service: DeliveryLedgerService;
  const prisma = {
    notificationDelivery: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DeliveryLedgerService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DeliveryLedgerService);
    jest.clearAllMocks();
  });

  it('writes one row per (recipient, channel) with a time-sortable id and sentAt only on SENT', async () => {
    await service.recordOutcomes({
      tenantId: 7,
      type: NotificationType.USER_JOINED,
      recipients: [
        {
          userId: 42,
          outcomes: [
            { channel: DeliveryChannel.IN_APP, status: DeliveryStatus.SENT },
            {
              channel: DeliveryChannel.PUSH,
              status: DeliveryStatus.FAILED,
              failureReason: DELIVERY_SKIP_REASONS.NO_DEVICE,
            },
          ],
        },
        {
          userId: 43,
          outcomes: [
            {
              channel: DeliveryChannel.EMAIL,
              status: DeliveryStatus.SKIPPED,
              failureReason: DELIVERY_SKIP_REASONS.NO_ADDRESS,
            },
          ],
        },
      ],
    });

    expect(prisma.notificationDelivery.createMany).toHaveBeenCalledTimes(1);
    const { data } = prisma.notificationDelivery.createMany.mock.calls[0][0];
    expect(data).toHaveLength(3);
    for (const row of data) {
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(row.tenantId).toBe(7);
      expect(row.type).toBe('USER_JOINED');
    }
    expect(data[0]).toMatchObject({ userId: 42, channel: 'IN_APP', status: 'SENT', failureReason: null });
    expect(data[0].sentAt).toBeInstanceOf(Date);
    expect(data[1]).toMatchObject({
      userId: 42,
      channel: 'PUSH',
      status: 'FAILED',
      failureReason: 'NO_DEVICE',
      sentAt: null,
    });
    expect(data[2]).toMatchObject({
      userId: 43,
      channel: 'EMAIL',
      status: 'SKIPPED',
      failureReason: 'NO_ADDRESS',
      sentAt: null,
    });
  });

  it('writes nothing for an empty audience', async () => {
    await service.recordOutcomes({ tenantId: 7, type: NotificationType.USER_INVITATION, recipients: [] });
    await service.recordOutcomes({
      tenantId: 7,
      type: NotificationType.USER_INVITATION,
      recipients: [{ userId: 1, outcomes: [] }],
    });
    expect(prisma.notificationDelivery.createMany).not.toHaveBeenCalled();
  });

  it('chunks a large audience so one DB blip loses a slice, not the whole trigger', async () => {
    const recipients = Array.from({ length: 120 }, (_, i) => ({
      userId: i + 1,
      outcomes: [
        { channel: DeliveryChannel.IN_APP, status: DeliveryStatus.SENT },
        { channel: DeliveryChannel.PUSH, status: DeliveryStatus.SENT },
      ],
    }));
    prisma.notificationDelivery.createMany.mockRejectedValueOnce(new Error('db blip'));

    await service.recordOutcomes({ tenantId: 7, type: NotificationType.INTEGRATION_SYNC_COMPLETED, recipients });

    // 240 rows → two inserts of 200 + 40; the first failed and the second still went.
    expect(prisma.notificationDelivery.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.notificationDelivery.createMany.mock.calls[0][0].data).toHaveLength(200);
    expect(prisma.notificationDelivery.createMany.mock.calls[1][0].data).toHaveLength(40);
  });

  it('never throws — a ledger failure must not fail the delivery it records', async () => {
    prisma.notificationDelivery.createMany.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.recordOutcomes({
        tenantId: 7,
        type: NotificationType.USER_INVITATION,
        recipients: [{ userId: 42, outcomes: [{ channel: DeliveryChannel.IN_APP, status: DeliveryStatus.SENT }] }],
      }),
    ).resolves.toBeUndefined();
  });

  it('purges by createdAt cutoff and returns the count', async () => {
    prisma.notificationDelivery.deleteMany.mockResolvedValueOnce({ count: 12 });
    const cutoff = new Date('2026-06-01T00:00:00Z');
    await expect(service.purgeOlderThan(cutoff)).resolves.toBe(12);
    expect(prisma.notificationDelivery.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: cutoff } } });
  });
  it('keeps a pre-generated id when the outcome carries one', async () => {
    await service.recordOutcomes({
      tenantId: 7,
      type: NotificationType.USER_INVITATION,
      recipients: [
        {
          userId: 1,
          outcomes: [
            {
              channel: DeliveryChannel.WHATSAPP,
              status: DeliveryStatus.QUEUED,
              deliveryId: '019a0000-0000-7000-8000-000000000001',
            },
          ],
        },
      ],
    });
    const { data } = prisma.notificationDelivery.createMany.mock.calls[0][0];
    expect(data[0]).toMatchObject({ id: '019a0000-0000-7000-8000-000000000001', status: 'QUEUED', sentAt: null });
  });

  it('markSent advances only a QUEUED row, stamping the provider id, sentAt and the attempt', async () => {
    await service.markSent('d1', 'im_123', 2);
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'QUEUED' },
      data: {
        status: 'SENT',
        providerMessageId: 'im_123',
        attemptCount: 2,
        sentAt: expect.any(Date),
        failureReason: null,
      },
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledTimes(1);
  });

  it('markSent after the webhook already moved the row keeps that status and only fills the provider id', async () => {
    prisma.notificationDelivery.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.markSent('d1', 'im_123', 1);
    expect(prisma.notificationDelivery.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 'd1', providerMessageId: null },
      data: { providerMessageId: 'im_123', attemptCount: 1 },
    });
  });

  it('claimSend takes a QUEUED, unclaimed row and refuses one already claimed', async () => {
    await expect(service.claimSend('d1', 1)).resolves.toBe(true);
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'QUEUED', sentAt: null },
      data: { sentAt: expect.any(Date), attemptCount: 1 },
    });
    prisma.notificationDelivery.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.claimSend('d1', 2)).resolves.toBe(false);
  });

  it('releaseClaim hands a still-QUEUED row back with the next attempt number', async () => {
    await service.releaseClaim('d1', 3);
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'QUEUED' },
      data: { sentAt: null, attemptCount: 3 },
    });
  });

  it('markFailed / markSkipped always carry a reason — the CHECK constraint demands it', async () => {
    await service.markFailed('d1', DELIVERY_SKIP_REASONS.PROVIDER_ERROR, 5);
    expect(prisma.notificationDelivery.update.mock.calls[0][0]).toEqual({
      where: { id: 'd1' },
      data: { status: 'FAILED', failureReason: 'PROVIDER_ERROR', attemptCount: 5 },
    });
    await service.markSkipped('d1', DELIVERY_SKIP_REASONS.NO_ADDRESS);
    expect(prisma.notificationDelivery.update.mock.calls[1][0]).toEqual({
      where: { id: 'd1' },
      data: { status: 'SKIPPED', failureReason: 'NO_ADDRESS' },
    });
  });

  describe('applyProviderStatus is monotonic', () => {
    const at = new Date('2026-08-31T10:00:00Z');

    it('DELIVERED only advances a QUEUED or SENT row', async () => {
      await service.applyProviderStatus({ providerMessageId: 'im_1', status: DeliveryStatus.DELIVERED, at });
      expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
        where: { channel: 'WHATSAPP', status: { in: ['QUEUED', 'SENT'] }, OR: [{ providerMessageId: 'im_1' }] },
        data: { status: 'DELIVERED', deliveredAt: at, providerMessageId: 'im_1' },
      });
    });

    it('READ advances from QUEUED, SENT or DELIVERED and stamps readAt', async () => {
      await service.applyProviderStatus({ providerMessageId: 'im_1', status: DeliveryStatus.READ, at });
      expect(prisma.notificationDelivery.updateMany.mock.calls[0][0]).toMatchObject({
        where: { status: { in: ['QUEUED', 'SENT', 'DELIVERED'] } },
        data: { status: 'READ', readAt: at },
      });
    });

    it('a late SENT never overwrites DELIVERED — the where clause excludes it', async () => {
      await service.applyProviderStatus({ providerMessageId: 'im_1', status: DeliveryStatus.SENT, at });
      expect(prisma.notificationDelivery.updateMany.mock.calls[0][0].where.status).toEqual({ in: ['QUEUED'] });
      expect(prisma.notificationDelivery.updateMany.mock.calls[0][0].data).toEqual({
        status: 'SENT',
        sentAt: at,
        providerMessageId: 'im_1',
      });
    });

    it('FAILED cannot follow DELIVERED — a delivered message has nothing left to fail', async () => {
      await service.applyProviderStatus({
        providerMessageId: 'im_1',
        status: DeliveryStatus.FAILED,
        at,
        failureReason: DELIVERY_SKIP_REASONS.PROVIDER_ERROR,
      });
      expect(prisma.notificationDelivery.updateMany.mock.calls[0][0]).toMatchObject({
        where: { status: { in: ['QUEUED', 'SENT'] } },
        data: { status: 'FAILED', failureReason: 'PROVIDER_ERROR' },
      });
    });

    it('FAILED without a stated reason still writes one', async () => {
      await service.applyProviderStatus({ providerMessageId: 'im_1', status: DeliveryStatus.FAILED, at });
      expect(prisma.notificationDelivery.updateMany.mock.calls[0][0].data.failureReason).toBe('PROVIDER_ERROR');
    });

    it('returns false when nothing matched — an unknown or already-final message', async () => {
      prisma.notificationDelivery.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.applyProviderStatus({ providerMessageId: 'nope', status: DeliveryStatus.DELIVERED, at }),
      ).resolves.toBe(false);
    });

    it('also matches our own ledger id echoed as callback data — only while the provider id is still unknown', async () => {
      await service.applyProviderStatus({
        providerMessageId: 'im_1',
        status: DeliveryStatus.SENT,
        at,
        callbackData: 'd1',
      });
      expect(prisma.notificationDelivery.updateMany.mock.calls[0][0].where.OR).toEqual([
        { providerMessageId: 'im_1' },
        { id: 'd1', providerMessageId: null },
      ]);
    });

    it('QUEUED is not a provider status — it is refused', async () => {
      await expect(
        service.applyProviderStatus({ providerMessageId: 'im_1', status: DeliveryStatus.QUEUED, at }),
      ).resolves.toBe(false);
      expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
    });
  });
  describe('stranded rows (E95-5)', () => {
    it('staleQueued ages a never-ran row from creation and a claimed row from the claim', async () => {
      const olderThan = new Date('2026-08-31T11:45:00Z');
      await service.staleQueued({ olderThan, claimed: false });
      expect(prisma.notificationDelivery.findMany).toHaveBeenLastCalledWith({
        where: { channel: 'WHATSAPP', status: 'QUEUED', createdAt: { lt: olderThan }, sentAt: null },
        select: { id: true },
        take: 200,
      });
      await service.staleQueued({ olderThan, claimed: true, limit: 50 });
      expect(prisma.notificationDelivery.findMany).toHaveBeenLastCalledWith({
        where: { channel: 'WHATSAPP', status: 'QUEUED', sentAt: { lt: olderThan } },
        select: { id: true },
        take: 50,
      });
    });

    it('markQueueLost closes only rows still QUEUED, with the reason the CHECK demands', async () => {
      prisma.notificationDelivery.updateMany.mockResolvedValueOnce({ count: 2 });
      await expect(service.markQueueLost(['a', 'b'])).resolves.toBe(2);
      expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] }, status: 'QUEUED' },
        data: { status: 'FAILED', failureReason: 'QUEUE_LOST' },
      });
      await expect(service.markQueueLost([])).resolves.toBe(0);
    });

    it('recordOutcomes writes one structured line per trigger for the WhatsApp channel — none when the channel is absent', async () => {
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
      await service.recordOutcomes({
        tenantId: 7,
        type: NotificationType.INTEGRATION_SYNC_COMPLETED,
        recipients: [
          {
            userId: 1,
            outcomes: [{ channel: DeliveryChannel.WHATSAPP, status: DeliveryStatus.QUEUED, deliveryId: 'd1' }],
          },
          {
            userId: 2,
            outcomes: [
              {
                channel: DeliveryChannel.WHATSAPP,
                status: DeliveryStatus.SKIPPED,
                failureReason: DELIVERY_SKIP_REASONS.FLAG_OFF,
              },
            ],
          },
          { userId: 3, outcomes: [{ channel: DeliveryChannel.IN_APP, status: DeliveryStatus.SENT }] },
        ],
      });
      expect(log).toHaveBeenCalledWith({
        msg: 'whatsapp-ledger',
        type: 'INTEGRATION_SYNC_COMPLETED',
        queued: 1,
        skipped: 1,
        failed: 0,
      });
      log.mockClear();
      await service.recordOutcomes({
        tenantId: 7,
        type: NotificationType.INTEGRATION_SYNC_COMPLETED,
        recipients: [{ userId: 3, outcomes: [{ channel: DeliveryChannel.IN_APP, status: DeliveryStatus.SENT }] }],
      });
      expect(log).not.toHaveBeenCalled();
    });
  });
});
