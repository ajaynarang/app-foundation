import { Test } from '@nestjs/testing';
import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
import { InAppNotificationService } from '../notifications.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';

describe('InAppNotificationService', () => {
  let service: InAppNotificationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        groupBy: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((fn: any, _opts?: any) => fn(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        InAppNotificationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AppCacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
          },
        },
      ],
    }).compile();

    service = module.get(InAppNotificationService);
  });

  describe('getUnreadCount', () => {
    it('should return per-category counts', async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { category: 'SYSTEM', _count: { id: 2 } },
        { category: 'BILLING', _count: { id: 3 } },
      ]);

      const result = await service.getUnreadCount(1);
      expect(result).toEqual({ total: 5, system: 2, team: 0, billing: 3 });
    });
  });

  describe('markAsUnread', () => {
    it('should set readAt to null', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      await service.markAsUnread('notif-123', 1);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { notificationId: 'notif-123', userId: 1, dismissedAt: null },
        data: { readAt: null },
      });
    });
  });

  describe('listForUser', () => {
    it('should list notifications with default pagination', async () => {
      prisma.notification.findMany = jest.fn().mockResolvedValue([]);
      prisma.notification.count = jest.fn().mockResolvedValue(0);

      const result = await service.listForUser(1);

      expect(result).toEqual({ items: [], nextCursor: null, total: 0 });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 1,
            channel: 'IN_APP',
            dismissedAt: null,
          }),
          orderBy: [{ createdAt: 'desc' }, { notificationId: 'desc' }],
          take: 51,
        }),
      );
      expect(prisma.notification.findMany.mock.calls[0][0].skip).toBeUndefined();
    });

    it('should filter by unread status', async () => {
      prisma.notification.findMany = jest.fn().mockResolvedValue([]);
      prisma.notification.count = jest.fn().mockResolvedValue(0);

      await service.listForUser(1, { status: 'unread' });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ readAt: null }),
        }),
      );
    });

    it('should filter by read status', async () => {
      prisma.notification.findMany = jest.fn().mockResolvedValue([]);
      prisma.notification.count = jest.fn().mockResolvedValue(0);

      await service.listForUser(1, { status: 'read' });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ readAt: { not: null } }),
        }),
      );
    });

    it('should filter by category', async () => {
      prisma.notification.findMany = jest.fn().mockResolvedValue([]);
      prisma.notification.count = jest.fn().mockResolvedValue(0);

      await service.listForUser(1, { category: 'BILLING' });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'BILLING' }),
        }),
      );
    });

    describe('walking pages over a fixture', () => {
      // A fan-out writes several notifications in one millisecond. One is dismissed, one is another user's.
      const stamps = tiedTimestamps(9);
      const rows = stamps.map((createdAt, index) => ({
        id: index + 1,
        notificationId: `ntf_${(index * 5) % 9}`,
        userId: index === 8 ? 2 : 1,
        tenantId: 10,
        channel: 'IN_APP',
        type: 'USER_JOINED',
        category: 'TEAM',
        title: `Notification ${index}`,
        message: 'Hello',
        actionUrl: null,
        actionLabel: null,
        iconType: null,
        readAt: index === 0 ? new Date('2026-03-02T00:00:00.000Z') : null,
        dismissedAt: index === 7 ? new Date('2026-03-02T00:00:00.000Z') : null,
        groupCount: 1,
        metadata: null,
        createdAt,
      }));

      beforeEach(() => Object.assign(prisma.notification, fixtureModel(rows)));

      it('returns every notification of the inbox once, ties included, and the total ignores the cursor', async () => {
        const totals: number[] = [];
        const { pages, items } = await walkCursorList(async (cursor) => {
          const page = await service.listForUser(1, { limit: 3, cursor });
          totals.push(page.total);
          return page;
        });

        expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
        expect(new Set(items.map((item) => item.notificationId)).size).toBe(7);
        const times = items.map((item) => item.createdAt.getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(totals).toEqual([7, 7, 7]);
      });

      it('names a notification by its public id: no Int key, user id or tenant id on the row', async () => {
        const { items } = await service.listForUser(1, { limit: 1 });
        expect(Object.keys(items[0]).sort()).toEqual(
          [
            'actionLabel',
            'actionUrl',
            'category',
            'createdAt',
            'groupCount',
            'iconType',
            'message',
            'metadata',
            'notificationId',
            'readAt',
            'title',
            'type',
          ].sort(),
        );
      });

      it('filters unread in the page and the total', async () => {
        const page = await service.listForUser(1, { status: 'unread', limit: 2 });
        expect(page.total).toBe(6);
        expect(page.items.every((item) => item.readAt === null)).toBe(true);
      });

      it('answers 400 on a cursor it did not issue, before any query runs', async () => {
        await expect(service.listForUser(1, { cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
        expect(prisma.notification.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('markAsRead', () => {
    it('should update readAt and bust cache', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markAsRead('notif-1', 1);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { notificationId: 'notif-1', userId: 1 },
        data: { readAt: expect.any(Date) },
      });
    });

    it('should log warning when notification not found', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAsRead('notif-missing', 1);
      expect(result.count).toBe(0);
    });
  });

  describe('dismiss', () => {
    it('should update dismissedAt and bust cache', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.dismiss('notif-1', 1);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { notificationId: 'notif-1', userId: 1 },
        data: { dismissedAt: expect.any(Date) },
      });
    });

    it('should log warning when notification not found', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.dismiss('notif-missing', 1);
      expect(result.count).toBe(0);
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead(1);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result.count).toBe(5);
    });

    it('should filter by category when provided', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 2 });

      await service.markAllRead(1, 'BILLING');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, readAt: null, category: 'BILLING' },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('dismissAllRead', () => {
    it('should dismiss all read notifications', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.dismissAllRead(1);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          readAt: { not: null },
          dismissedAt: null,
        },
        data: { dismissedAt: expect.any(Date) },
      });
      expect(result.count).toBe(3);
    });
  });

  describe('getUnreadCount — edge cases', () => {
    it('should return zero counts when no notifications', async () => {
      prisma.notification.groupBy.mockResolvedValue([]);

      const result = await service.getUnreadCount(1);
      expect(result).toEqual({ total: 0, system: 0, team: 0, billing: 0 });
    });

    it('should handle unknown categories gracefully', async () => {
      prisma.notification.groupBy.mockResolvedValue([{ category: 'UNKNOWN', _count: { id: 3 } }]);

      const result = await service.getUnreadCount(1);
      expect(result.total).toBe(3);
    });
  });
});
