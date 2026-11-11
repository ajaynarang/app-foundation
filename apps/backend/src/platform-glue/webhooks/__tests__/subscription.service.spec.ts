import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as dns from 'node:dns';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookSubscriptionService } from '../subscription.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';

jest.mock('node:dns', () => ({ ...jest.requireActual('node:dns'), lookup: jest.fn() }));

/** Makes every host resolve to these addresses, as `dns.lookup(host, { all: true })` would report them. */
const resolveTo = (...addresses: string[]) =>
  (dns.lookup as unknown as jest.Mock).mockImplementation(
    (_host: string, _options: unknown, callback: (err: Error | null, addresses: unknown) => void) =>
      callback(
        null,
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
      ),
  );

describe('WebhookSubscriptionService', () => {
  let service: WebhookSubscriptionService;
  let prisma: any;
  let queue: any;

  beforeEach(async () => {
    (dns.lookup as unknown as jest.Mock).mockReset();
    prisma = {
      webhookSubscription: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      webhookDeliveryLog: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      domainEventLog: {
        findMany: jest.fn(),
      },
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ tenantId: 'tenant-slug-1' }),
      },
    };

    queue = {
      add: jest.fn().mockResolvedValue({}),
    };

    const module = await Test.createTestingModule({
      providers: [
        WebhookSubscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(QUEUE_NAMES.WEBHOOKS), useValue: queue },
        { provide: ConfigService, useValue: { get: () => false } },
      ],
    }).compile();

    service = module.get(WebhookSubscriptionService);
  });

  describe('SSRF guard at registration', () => {
    const tenantId = 1;
    const input = (url: string) => ({ url, events: ['*'] });

    beforeEach(() => {
      prisma.webhookSubscription.create.mockImplementation(({ data }: any) => ({ id: 'sub-new', ...data }));
      prisma.webhookSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId, active: true });
      prisma.webhookSubscription.update.mockResolvedValue({ id: 'sub-1' });
    });

    it('saves a subscription whose host resolves only to public addresses', async () => {
      resolveTo('93.184.216.34', '2606:2800:220:1::1');

      await service.create(tenantId, input('https://hooks.partner-site.com/in'));

      expect(prisma.webhookSubscription.create).toHaveBeenCalled();
    });

    it.each([
      ['a private address', '10.0.0.5'],
      ['loopback', '127.0.0.1'],
      ['the metadata address', '169.254.169.254'],
      ['CGNAT', '100.64.0.9'],
      ['an IPv6-mapped private address', '::ffff:10.0.0.5'],
    ])('refuses a public-looking host that resolves to %s, on create and on update', async (_label, address) => {
      resolveTo('93.184.216.34', address);

      await expect(service.create(tenantId, input('https://hooks.partner-site.com/in'))).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update(tenantId, 'sub-1', { url: 'https://hooks.partner-site.com/in' })).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.webhookSubscription.create).not.toHaveBeenCalled();
      expect(prisma.webhookSubscription.update).not.toHaveBeenCalled();
    });

    it.each([['https://169.254.169.254/latest/meta-data/'], ['https://localhost/hook'], ['http://partner.com/hook']])(
      'refuses %s before resolving anything',
      async (url) => {
        await expect(service.create(tenantId, input(url))).rejects.toThrow(BadRequestException);
        expect(dns.lookup).not.toHaveBeenCalled();
        expect(prisma.webhookSubscription.create).not.toHaveBeenCalled();
      },
    );

    it('does not check the URL when an update leaves it unchanged', async () => {
      await service.update(tenantId, 'sub-1', { active: false });

      expect(dns.lookup).not.toHaveBeenCalled();
      expect(prisma.webhookSubscription.update).toHaveBeenCalled();
    });
  });

  describe('signing secret', () => {
    const tenantId = 1;
    const HOUR_MS = 60 * 60 * 1000;
    const stored = { id: 'sub-1', tenantId, url: 'https://partner.com/hook', events: ['*'], active: true };

    beforeEach(() => {
      prisma.webhookSubscription.findFirst.mockResolvedValue({ secret: 'old-secret' });
      prisma.webhookSubscription.updateMany.mockResolvedValue({ count: 1 });
      prisma.webhookSubscription.findUnique.mockResolvedValue({ ...stored, _count: { deliveryLogs: 3 } });
    });

    it('issues a whsec_ secret on create and returns it once', async () => {
      resolveTo('93.184.216.34');
      prisma.webhookSubscription.create.mockImplementation(({ data }: any) => ({ id: 'sub-new', ...data }));

      const created = await service.create(tenantId, { url: 'https://partner.com/hook', events: ['*'] });

      expect(created.signingSecret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/);
      expect(prisma.webhookSubscription.create.mock.calls[0][0].data.secret).toBe(created.signingSecret);
    });

    it('rotates: stores a new secret, keeps the old one signing for 24 hours by default, and returns the new one once', async () => {
      const before = Date.now();

      const rotated = await service.rotateSecret(tenantId, 'sub-1', {});

      const { where, data } = prisma.webhookSubscription.updateMany.mock.calls[0][0];
      expect(where).toEqual({ id: 'sub-1', tenantId, secret: 'old-secret' });
      expect(data.secret).toMatch(/^whsec_/);
      expect(data.previousSecret).toBe('old-secret');
      expect(data.previousSecretExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * HOUR_MS);
      expect(data.previousSecretExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * HOUR_MS);
      expect(rotated.signingSecret).toBe(data.secret);
      expect(rotated).not.toHaveProperty('secret');
      expect(rotated).not.toHaveProperty('previousSecret');
    });

    it('honours the chosen overlap, and an overlap of 0 retires the old secret at once', async () => {
      await service.rotateSecret(tenantId, 'sub-1', { overlapHours: 2 });
      const withOverlap = prisma.webhookSubscription.updateMany.mock.calls[0][0].data;
      expect(withOverlap.previousSecretExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 2 * HOUR_MS);
      expect(withOverlap.previousSecretExpiresAt.getTime()).toBeGreaterThan(Date.now() + HOUR_MS);

      await service.rotateSecret(tenantId, 'sub-1', { overlapHours: 0 });
      const immediate = prisma.webhookSubscription.updateMany.mock.calls[1][0].data;
      expect(immediate.previousSecret).toBeNull();
      expect(immediate.previousSecretExpiresAt).toBeNull();
    });

    it('rejects a rotation that lost a race with another one, so no overwritten secret is shown', async () => {
      prisma.webhookSubscription.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.rotateSecret(tenantId, 'sub-1', {})).rejects.toThrow(ConflictException);
    });

    it("does not rotate another tenant's subscription", async () => {
      prisma.webhookSubscription.findFirst.mockResolvedValue(null);

      await expect(service.rotateSecret(2, 'sub-1', {})).rejects.toThrow(NotFoundException);

      expect(prisma.webhookSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub-1', tenantId: 2 } }),
      );
      expect(prisma.webhookSubscription.updateMany).not.toHaveBeenCalled();
    });

    it('never selects a secret when listing or reading a subscription', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([]);
      prisma.webhookSubscription.count.mockResolvedValue(0);

      await service.findAll(tenantId, { limit: 20, offset: 0 });
      await service.findOne(tenantId, 'sub-1');

      for (const select of [
        prisma.webhookSubscription.findMany.mock.calls[0][0].select,
        prisma.webhookSubscription.findUnique.mock.calls[0][0].select,
      ]) {
        expect(select).not.toHaveProperty('secret');
        expect(select).not.toHaveProperty('previousSecret');
        expect(select.previousSecretExpiresAt).toBe(true);
      }
    });
  });

  describe('getEventCatalog', () => {
    it('returns categories with events', () => {
      const result = service.getEventCatalog();
      expect(result.categories).toBeDefined();
      expect(result.categories.length).toBeGreaterThan(0);
      expect(result.categories[0].label).toBeTruthy();
      expect(result.categories[0].events.length).toBeGreaterThan(0);
    });

    it('excludes internal events from catalog', () => {
      const result = service.getEventCatalog();
      const allEvents = result.categories.flatMap((c: any) => c.events.map((e: any) => e.name));
      expect(allEvents).not.toContain('app.sync.started');
      expect(allEvents).not.toContain('app.telematics.updated');
      expect(allEvents).not.toContain('app.preferences.updated');
    });
  });

  describe('retryDelivery', () => {
    const tenantId = 1;
    const subId = 'sub-1';
    const logId = 'log-1';

    beforeEach(() => {
      prisma.webhookSubscription.findUnique.mockResolvedValue({
        id: subId,
        tenantId,
        active: true,
      });
    });

    it('queues retry for failed delivery', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: logId,
        subscriptionId: subId,
        failedAt: new Date(),
        payload: { event: 'app.load.created', data: {} },
      });
      prisma.webhookDeliveryLog.update.mockResolvedValue({});

      const result = await service.retryDelivery(tenantId, subId, logId);

      expect(queue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          tenantId: expect.any(String),
          metadata: expect.objectContaining({ source: 'replay', version: 1 }),
          payload: expect.objectContaining({ subscriptionId: subId, logId }),
        }),
        expect.any(Object),
      );
      expect(result.message).toContain('retry');
    });

    it('throws NotFoundException for missing log', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue(null);

      await expect(service.retryDelivery(tenantId, subId, logId)).rejects.toThrow('Delivery log not found');
    });

    it('throws BadRequestException for non-failed delivery', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: logId,
        subscriptionId: subId,
        failedAt: null,
        payload: {},
      });

      await expect(service.retryDelivery(tenantId, subId, logId)).rejects.toThrow(
        'Only failed deliveries can be retried',
      );
    });

    it('throws NotFoundException for log belonging to different subscription', async () => {
      prisma.webhookDeliveryLog.findUnique.mockResolvedValue({
        id: logId,
        subscriptionId: 'other-sub',
        failedAt: new Date(),
        payload: {},
      });

      await expect(service.retryDelivery(tenantId, subId, logId)).rejects.toThrow('Delivery log not found');
    });
  });

  describe('replayEvents', () => {
    const tenantId = 1;
    const subId = 'sub-1';

    beforeEach(() => {
      prisma.webhookSubscription.findUnique.mockResolvedValue({
        id: subId,
        tenantId,
        active: true,
        events: ['*'],
      });
    });

    it('replays events from event log', async () => {
      prisma.domainEventLog.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          event: 'app.load.created',
          version: 1,
          tenantId,
          createdAt: new Date(),
          actorId: null,
          actorType: null,
          actorLabel: null,
          data: { loadId: 'LD-1' },
          tenant: { tenantId: 'tenant-slug-1' },
        },
        {
          id: 'evt-2',
          event: 'app.load.updated',
          version: 1,
          tenantId,
          createdAt: new Date(),
          actorId: 'u-1',
          actorType: 'user',
          actorLabel: 'John',
          data: { loadId: 'LD-1' },
          tenant: { tenantId: 'tenant-slug-1' },
        },
      ]);
      prisma.webhookDeliveryLog.create.mockResolvedValue({ id: 'log-new' });

      const result = await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
        limit: 1000,
      });

      expect(result.message).toContain('2 events queued');
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(prisma.webhookDeliveryLog.create).toHaveBeenCalledTimes(2);
      // External payload identifies the tenant by slug, not Int DB id.
      const firstPayload = prisma.webhookDeliveryLog.create.mock.calls[0][0].data.payload;
      expect(firstPayload.tenantId).toBe('tenant-slug-1');
    });

    it('filters by specific events', async () => {
      prisma.domainEventLog.findMany.mockResolvedValue([]);

      await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
        events: ['app.load.created'],
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: { in: ['app.load.created'] },
          }),
        }),
      );
    });

    it('returns 0 events when none match', async () => {
      prisma.domainEventLog.findMany.mockResolvedValue([]);

      const result = await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
      });

      expect(result.message).toContain('0 events queued');
    });

    it('filters replay by subscription event list', async () => {
      prisma.webhookSubscription.findUnique.mockResolvedValue({
        id: subId,
        tenantId,
        active: true,
        events: ['app.load.created', 'app.load.updated'],
      });
      prisma.domainEventLog.findMany.mockResolvedValue([]);

      await service.replayEvents(tenantId, subId, {
        since: '2026-04-01T00:00:00Z',
      });

      expect(prisma.domainEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: { in: ['app.load.created', 'app.load.updated'] },
          }),
        }),
      );
    });
  });
});
