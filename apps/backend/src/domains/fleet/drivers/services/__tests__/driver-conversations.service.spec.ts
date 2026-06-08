import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DriverConversationsService } from '../driver-conversations.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { PushService } from '../../../../../infrastructure/push/push.service';

describe('DriverConversationsService', () => {
  let service: DriverConversationsService;
  let prisma: any;
  let events: { emit: jest.Mock };
  let push: { sendPushToUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      conversation: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
      conversationMessage: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      load: { findFirst: jest.fn() },
      driver: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const cache = { getOrSet: jest.fn((_k: string, fn: () => unknown) => fn()), del: jest.fn() };
    events = { emit: jest.fn() };
    push = { sendPushToUser: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DriverConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: DomainEventService, useValue: events },
        { provide: PushService, useValue: push },
      ],
    }).compile();
    service = moduleRef.get(DriverConversationsService);
  });

  describe('listConversations', () => {
    it('maps a driver conversation row with unread + whoSpokeLast', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 10,
          dispatcherReadAt: new Date('2026-05-19T10:00:00Z'),
          driver: { driverId: 'DRV-001', name: 'Mike Reyes' },
          messages: [
            {
              content: 'on my way',
              role: 'driver',
              createdAt: new Date('2026-05-19T11:00:00Z'),
              load: { loadNumber: 'LD-001' },
            },
          ],
        },
      ]);
      // One driver message after the dispatcher's read marker → 1 unread.
      prisma.conversationMessage.findMany.mockResolvedValue([
        { conversationId: 10, createdAt: new Date('2026-05-19T11:00:00Z') },
      ]);

      const rows = await service.listConversations(1);

      expect(rows).toHaveLength(1);
      expect(rows[0].driverId).toBe('DRV-001');
      expect(rows[0].driverName).toBe('Mike Reyes');
      expect(rows[0].whoSpokeLast).toBe('driver');
      expect(rows[0].unreadCount).toBe(1);
      expect(rows[0].currentLoadNumber).toBe('LD-001');
      expect(rows[0].lastMessage).toBe('on my way');
    });

    it('does not count a driver message sent before the read marker', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 11,
          dispatcherReadAt: new Date('2026-05-19T10:00:00Z'),
          driver: { driverId: 'DRV-002', name: 'Read Up' },
          messages: [{ content: 'old', role: 'driver', createdAt: new Date('2026-05-19T09:00:00Z'), load: null }],
        },
      ]);
      prisma.conversationMessage.findMany.mockResolvedValue([
        { conversationId: 11, createdAt: new Date('2026-05-19T09:00:00Z') },
      ]);
      const rows = await service.listConversations(1);
      expect(rows[0].unreadCount).toBe(0);
    });

    it('returns an empty array when the tenant has no driver conversations', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      expect(await service.listConversations(1)).toEqual([]);
    });

    it('skips a conversation with no resolvable driver', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ id: 12, dispatcherReadAt: null, driver: null, messages: [] }]);
      expect(await service.listConversations(1)).toEqual([]);
    });

    it('handles a conversation with no messages (idle driver)', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 13,
          dispatcherReadAt: null,
          driver: { driverId: 'DRV-IDLE', name: 'Idle' },
          messages: [],
        },
      ]);
      const rows = await service.listConversations(1);
      expect(rows[0].lastMessage).toBeNull();
      expect(rows[0].currentLoadNumber).toBeNull();
      expect(rows[0].whoSpokeLast).toBeNull();
    });

    it('sorts rows by most recent activity first', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 14,
          dispatcherReadAt: null,
          driver: { driverId: 'DRV-OLD', name: 'Old' },
          messages: [{ content: 'a', role: 'driver', createdAt: new Date('2026-05-19T08:00:00Z'), load: null }],
        },
        {
          id: 15,
          dispatcherReadAt: null,
          driver: { driverId: 'DRV-NEW', name: 'New' },
          messages: [{ content: 'b', role: 'driver', createdAt: new Date('2026-05-19T12:00:00Z'), load: null }],
        },
      ]);
      const rows = await service.listConversations(1);
      expect(rows.map((r) => r.driverId)).toEqual(['DRV-NEW', 'DRV-OLD']);
    });

    it('truncates a long last-message preview', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 16,
          dispatcherReadAt: null,
          driver: { driverId: 'DRV-1', name: 'X' },
          messages: [{ content: 'x'.repeat(200), role: 'driver', createdAt: new Date(), load: null }],
        },
      ]);
      const rows = await service.listConversations(1);
      expect(rows[0].lastMessage.length).toBeLessThanOrEqual(120);
      expect(rows[0].lastMessage.endsWith('…')).toBe(true);
    });
  });

  describe('getThread', () => {
    it('returns messages oldest-first with the load tag', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        messages: [
          {
            messageId: 'm1',
            role: 'dispatcher',
            content: 'where are you',
            inputMode: 'dispatcher',
            createdAt: new Date('2026-05-19T09:00:00Z'),
            load: { loadNumber: 'LD-001' },
          },
        ],
      });
      const thread = await service.getThread(1, 'DRV-001');
      expect(thread).toHaveLength(1);
      expect(thread[0].id).toBe('m1');
      expect(thread[0].loadNumber).toBe('LD-001');
    });

    it('returns an empty array when the driver has no conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      expect(await service.getThread(1, 'DRV-NEW')).toEqual([]);
    });
  });

  describe('markRead', () => {
    it('stamps dispatcherReadAt by default and busts the list cache', async () => {
      await service.markRead(1, 'DRV-001');
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dispatcherReadAt: expect.any(Date) }) }),
      );
    });

    it('stamps driverReadAt when the viewer is the driver', async () => {
      await service.markRead(1, 'DRV-001', 'driver');
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driverReadAt: expect.any(Date) }) }),
      );
    });
  });

  describe('unreadForDriver', () => {
    it('returns 0 when the driver has no conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      expect(await service.unreadForDriver(1, 'DRV-NEW', 'dispatcher')).toBe(0);
    });

    it('counts the other role’s messages after the viewer’s read marker', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        id: 7,
        dispatcherReadAt: new Date('2026-05-19T10:00:00Z'),
        driverReadAt: null,
      });
      prisma.conversationMessage.count.mockResolvedValue(4);

      const count = await service.unreadForDriver(1, 'DRV-001', 'dispatcher');

      expect(count).toBe(4);
      // A dispatcher's unread = driver messages after dispatcherReadAt.
      expect(prisma.conversationMessage.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ role: 'driver' }) }),
      );
    });
  });

  describe('sendMessage', () => {
    it('upserts the driver conversation and creates the message with the load tag', async () => {
      prisma.conversation.upsert.mockResolvedValue({
        id: 10,
        conversationId: 'driver-dispatch-1-DRV-001',
        userMode: 'driver_dispatch',
        title: null,
      });
      prisma.load.findFirst.mockResolvedValue({ id: 5, loadNumber: 'LD-001', referenceNumber: 'PO-12345' });
      prisma.conversationMessage.create.mockResolvedValue({
        messageId: 'msg-1',
        role: 'dispatcher',
        content: 'on it',
        createdAt: new Date('2026-05-19T12:00:00Z'),
      });

      const msg = await service.sendMessage(
        1,
        'DRV-001',
        { content: 'on it', loadNumber: 'LD-001' },
        'dispatcher',
        'user-1',
      );

      expect(prisma.conversation.upsert).toHaveBeenCalled();
      expect(prisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ loadId: 5, role: 'dispatcher' }) }),
      );
      expect(events.emit).toHaveBeenCalled();
      expect(msg.content).toBe('on it');
      expect(msg.loadNumber).toBe('LD-001');
      expect(msg.loadReference).toBe('PO-12345');
    });

    it('defaults to the active load when loadNumber is omitted', async () => {
      prisma.conversation.upsert.mockResolvedValue({
        id: 10,
        conversationId: 'c',
        userMode: 'driver_dispatch',
        title: null,
      });
      prisma.load.findFirst.mockResolvedValue({ id: 9, loadNumber: 'LD-009', referenceNumber: null });
      prisma.conversationMessage.create.mockResolvedValue({
        messageId: 'm',
        role: 'dispatcher',
        content: 'hi',
        createdAt: new Date(),
      });

      await service.sendMessage(1, 'DRV-001', { content: 'hi' }, 'dispatcher', 'user-1');

      expect(prisma.load.findFirst).toHaveBeenCalled();
      expect(prisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ loadId: 9 }) }),
      );
    });

    it('creates a general (no-load) message when loadNumber is explicitly null', async () => {
      prisma.conversation.upsert.mockResolvedValue({
        id: 10,
        conversationId: 'c',
        userMode: 'driver_dispatch',
        title: null,
      });
      prisma.conversationMessage.create.mockResolvedValue({
        messageId: 'm',
        role: 'dispatcher',
        content: 'payroll',
        createdAt: new Date(),
      });

      await service.sendMessage(1, 'DRV-001', { content: 'payroll', loadNumber: null }, 'dispatcher', 'user-1');

      expect(prisma.load.findFirst).not.toHaveBeenCalled();
      expect(prisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ loadId: null }) }),
      );
    });

    it('throws NotFoundException when an explicit load is not found', async () => {
      prisma.conversation.upsert.mockResolvedValue({
        id: 10,
        conversationId: 'c',
        userMode: 'driver_dispatch',
        title: null,
      });
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(1, 'DRV-001', { content: 'x', loadNumber: 'LD-NOPE' }, 'dispatcher', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('pushes to the driver device when a dispatcher sends', async () => {
      prisma.conversation.upsert.mockResolvedValue({
        id: 10,
        conversationId: 'c',
        userMode: 'driver_dispatch',
        title: null,
      });
      prisma.conversationMessage.create.mockResolvedValue({
        messageId: 'm',
        role: 'dispatcher',
        content: 'on it',
        createdAt: new Date(),
      });
      prisma.driver.findFirst.mockResolvedValue({ user: { id: 88 } });

      await service.sendMessage(1, 'DRV-001', { content: 'on it', loadNumber: null }, 'dispatcher', 'user-1');
      // Push is fire-and-forget — let the microtask settle.
      await Promise.resolve();

      expect(push.sendPushToUser).toHaveBeenCalledWith(88, expect.objectContaining({ title: expect.any(String) }));
    });

    it('does not push when a driver sends', async () => {
      prisma.conversation.upsert.mockResolvedValue({
        id: 10,
        conversationId: 'c',
        userMode: 'driver_dispatch',
        title: null,
      });
      prisma.conversationMessage.create.mockResolvedValue({
        messageId: 'm',
        role: 'driver',
        content: 'on my way',
        createdAt: new Date(),
      });

      await service.sendMessage(1, 'DRV-001', { content: 'on my way', loadNumber: null }, 'driver', 'user-2');
      await Promise.resolve();

      expect(push.sendPushToUser).not.toHaveBeenCalled();
    });
  });
});
