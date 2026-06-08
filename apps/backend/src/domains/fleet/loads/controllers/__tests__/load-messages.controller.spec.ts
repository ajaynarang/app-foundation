import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LoadMessagesController } from '../load-messages.controller';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DriverConversationsService } from '../../../drivers/services/driver-conversations.service';

/**
 * The load-messages controller is a load-scoped delegate over the
 * driver-keyed `DriverConversationsService`. These tests cover the delegation
 * wiring + the load→driver resolution guard (unassigned load, driver scope).
 */
describe('LoadMessagesController', () => {
  let controller: LoadMessagesController;
  let prisma: any;
  let conversations: {
    getThread: jest.Mock;
    sendMessage: jest.Mock;
    markRead: jest.Mock;
    unreadForDriver: jest.Mock;
  };

  const dispatcher = { tenantId: 't-1', role: 'DISPATCHER', userId: 'u-1' };
  const driver = { tenantId: 't-1', role: 'DRIVER', userId: 'u-2', driverId: 'DRV-001' };

  beforeEach(async () => {
    prisma = {
      load: { findFirst: jest.fn() },
      conversationMessage: { findUnique: jest.fn(), update: jest.fn() },
      tenant: { findUnique: jest.fn() },
    };
    conversations = {
      getThread: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue({ id: 'm1', role: 'dispatcher', content: 'hi', createdAt: 'x' }),
      markRead: jest.fn().mockResolvedValue(undefined),
      unreadForDriver: jest.fn().mockResolvedValue(3),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [LoadMessagesController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: DriverConversationsService, useValue: conversations },
      ],
    }).compile();
    controller = moduleRef.get(LoadMessagesController);
    jest.spyOn(controller as never, 'getTenantDbId').mockResolvedValue(1 as never);
  });

  describe('resolveLoadDriver guard', () => {
    it('throws NotFoundException for an unknown load', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      await expect(controller.getMessages(dispatcher, 'LD-NOPE')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the load has no assigned driver', async () => {
      prisma.load.findFirst.mockResolvedValue({ driver: null });
      await expect(controller.sendMessage(dispatcher, 'LD-001', { content: 'hi' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("blocks a driver from another driver's load thread", async () => {
      prisma.load.findFirst.mockResolvedValue({ isRelay: false, driver: { driverId: 'DRV-999' }, legs: [] });
      await expect(controller.getMessages(driver, 'LD-001')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('resolves a relay leg driver to their own leg thread', async () => {
      prisma.load.findFirst.mockResolvedValue({
        isRelay: true,
        driver: { driverId: 'DRV-PRIMARY' },
        legs: [{ driver: { driverId: 'DRV-999' } }, { driver: { driverId: 'DRV-001' } }],
      });
      await controller.getMessages(driver, 'LD-RELAY');
      // The leg driver's own thread, not the primary's.
      expect(conversations.getThread).toHaveBeenCalledWith(1, 'DRV-001', 'LD-RELAY');
    });

    it('blocks a driver not on any leg of a relay load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        isRelay: true,
        driver: { driverId: 'DRV-PRIMARY' },
        legs: [{ driver: { driverId: 'DRV-999' } }],
      });
      await expect(controller.getMessages(driver, 'LD-RELAY')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('delegation', () => {
    beforeEach(() => {
      prisma.load.findFirst.mockResolvedValue({ driver: { driverId: 'DRV-001' } });
    });

    it('getMessages reads the driver thread filtered to the load', async () => {
      await controller.getMessages(dispatcher, 'LD-001');
      expect(conversations.getThread).toHaveBeenCalledWith(1, 'DRV-001', 'LD-001');
    });

    it('sendMessage tags the message with the load', async () => {
      await controller.sendMessage(dispatcher, 'LD-001', { content: 'rolling' });
      expect(conversations.sendMessage).toHaveBeenCalledWith(
        1,
        'DRV-001',
        { content: 'rolling', loadNumber: 'LD-001' },
        'dispatcher',
        'u-1',
      );
    });

    it('sendMessage from a driver uses the driver role', async () => {
      await controller.sendMessage(driver, 'LD-001', { content: 'on my way' });
      expect(conversations.sendMessage).toHaveBeenCalledWith(
        1,
        'DRV-001',
        { content: 'on my way', loadNumber: 'LD-001' },
        'driver',
        'u-2',
      );
    });

    it('getUnreadCount returns the driver-thread unread for the viewer role', async () => {
      const result = await controller.getUnreadCount(dispatcher, 'LD-001');
      expect(conversations.unreadForDriver).toHaveBeenCalledWith(1, 'DRV-001', 'dispatcher');
      expect(result).toEqual({ count: 3 });
    });

    it('markRead marks the thread read for the viewer role', async () => {
      await controller.markRead(driver, 'LD-001');
      expect(conversations.markRead).toHaveBeenCalledWith(1, 'DRV-001', 'driver');
    });
  });

  describe('markDelivered', () => {
    beforeEach(() => {
      prisma.load.findFirst.mockResolvedValue({ driver: { driverId: 'DRV-001' } });
    });

    it('stamps deliveredAt on a dispatcher message', async () => {
      prisma.conversationMessage.findUnique.mockResolvedValue({ role: 'dispatcher' });
      await controller.markDelivered(driver, 'LD-001', 'msg-1');
      expect(prisma.conversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { messageId: 'msg-1' } }),
      );
    });

    it('is a no-op for a driver message', async () => {
      prisma.conversationMessage.findUnique.mockResolvedValue({ role: 'driver' });
      const result = await controller.markDelivered(driver, 'LD-001', 'msg-2');
      expect(prisma.conversationMessage.update).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });
});
