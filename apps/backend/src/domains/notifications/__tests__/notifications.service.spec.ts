import { Test } from '@nestjs/testing';
import { InAppNotificationService } from '../notifications.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';

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

  describe('create with grouping', () => {
    it('should create new notification when no group exists', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 1,
        notificationId: 'test-123',
      });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'INVOICE_GENERATED' as any,
        category: 'BILLING',
        title: 'Invoice #1',
        message: 'Generated',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      const data = prisma.notification.create.mock.calls[0][0].data;
      expect(data.groupKey).toBeDefined();
      expect(data.groupCount).toBe(1);
    });

    it('should append to existing group within 10 min window', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 1,
        groupCount: 2,
        groupKey: 'INVOICE_GENERATED:1:123',
        metadata: { items: [{ title: 'A' }, { title: 'B' }] },
      });
      prisma.notification.update.mockResolvedValue({ id: 1 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'INVOICE_GENERATED' as any,
        category: 'BILLING',
        title: 'Invoice #3',
        message: 'Generated',
      });

      expect(prisma.notification.update).toHaveBeenCalled();
      const data = prisma.notification.update.mock.calls[0][0].data;
      expect(data.groupCount).toBe(3);
      expect(data.message).toBe('3 invoices generated');
    });

    it('should create new group when existing group has 20 items', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 1,
        groupCount: 20,
        groupKey: 'INVOICE_GENERATED:1:123',
        metadata: { items: Array(20).fill({ title: 'X' }) },
      });
      prisma.notification.create.mockResolvedValue({ id: 2 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'INVOICE_GENERATED' as any,
        category: 'BILLING',
        title: 'Invoice #21',
        message: 'Generated',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should create notification without metadata', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 3 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'USER_JOINED' as any,
        category: 'TEAM',
        title: 'New user',
        message: 'Welcome',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      const data = prisma.notification.create.mock.calls[0][0].data;
      expect(data.metadata).toBeDefined();
      expect(data.metadata.items).toHaveLength(1);
    });

    it('should create notification with custom metadata', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({ id: 4 });

      await service.create({
        recipientId: 1,
        tenantId: 1,
        type: 'INVOICE_SENT' as any,
        category: 'BILLING',
        title: 'Invoice sent',
        message: 'Sent',
        metadata: { invoiceNumber: 'INV-123' },
      });

      expect(prisma.notification.create).toHaveBeenCalled();
      const data = prisma.notification.create.mock.calls[0][0].data;
      expect(data.metadata.invoiceNumber).toBe('INV-123');
      expect(data.metadata.items).toBeDefined();
    });
  });

  describe('listForUser', () => {
    it('should list notifications with default pagination', async () => {
      prisma.notification.findMany = jest.fn().mockResolvedValue([]);
      prisma.notification.count = jest.fn().mockResolvedValue(0);

      const result = await service.listForUser(1);

      expect(result).toEqual({ data: [], total: 0 });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 1,
            channel: 'IN_APP',
            dismissedAt: null,
          }),
          skip: 0,
          take: 20,
        }),
      );
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

    it('should paginate correctly', async () => {
      prisma.notification.findMany = jest.fn().mockResolvedValue([]);
      prisma.notification.count = jest.fn().mockResolvedValue(50);

      const result = await service.listForUser(1, { page: 3, limit: 10 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
      expect(result.total).toBe(50);
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
