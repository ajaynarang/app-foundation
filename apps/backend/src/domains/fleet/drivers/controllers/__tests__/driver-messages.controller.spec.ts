import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DriverMessagesController } from '../driver-messages.controller';
import { DriverConversationsService } from '../../services/driver-conversations.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DriverMessagesController', () => {
  let controller: DriverMessagesController;
  let svc: {
    listConversations: jest.Mock;
    getThread: jest.Mock;
    sendMessage: jest.Mock;
    markRead: jest.Mock;
  };

  beforeEach(async () => {
    svc = {
      listConversations: jest.fn().mockResolvedValue([]),
      getThread: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue({ id: 'm1', role: 'dispatcher', content: 'hi', createdAt: 'x' }),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DriverMessagesController],
      providers: [
        { provide: DriverConversationsService, useValue: svc },
        { provide: PrismaService, useValue: { tenant: { findUnique: jest.fn() } } },
      ],
    }).compile();
    controller = moduleRef.get(DriverMessagesController);
    jest.spyOn(controller as never, 'getTenantDbId').mockResolvedValue(1 as never);
  });

  it('lists conversations for the tenant', async () => {
    await controller.list({ tenantId: 't' });
    expect(svc.listConversations).toHaveBeenCalledWith(1);
  });

  it('returns the thread for a driver', async () => {
    await controller.thread({ role: 'DISPATCHER', tenantId: 't' }, 'DRV-001');
    expect(svc.getThread).toHaveBeenCalledWith(1, 'DRV-001');
  });

  it('sends a message with the dispatcher role for a dispatcher user', async () => {
    await controller.send({ tenantId: 't', role: 'DISPATCHER', userId: 'u1' }, 'DRV-001', { content: 'hi' });
    expect(svc.sendMessage).toHaveBeenCalledWith(1, 'DRV-001', { content: 'hi' }, 'dispatcher', 'u1');
  });

  it('sends a message with the driver role for a driver user on their own thread', async () => {
    await controller.send({ tenantId: 't', role: 'DRIVER', userId: 'u2', driverId: 'DRV-001' }, 'DRV-001', {
      content: 'on my way',
    });
    expect(svc.sendMessage).toHaveBeenCalledWith(1, 'DRV-001', { content: 'on my way' }, 'driver', 'u2');
  });

  it("blocks a driver from sending into another driver's thread", async () => {
    await expect(
      controller.send({ tenantId: 't', role: 'DRIVER', userId: 'u2', driverId: 'DRV-001' }, 'DRV-999', {
        content: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks a driver from reading another driver's thread", async () => {
    await expect(
      controller.thread({ role: 'DRIVER', tenantId: 't', driverId: 'DRV-001' }, 'DRV-999'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('marks a thread read for the dispatcher', async () => {
    const result = await controller.markRead({ tenantId: 't', role: 'DISPATCHER' }, 'DRV-001');
    expect(svc.markRead).toHaveBeenCalledWith(1, 'DRV-001', 'dispatcher');
    expect(result).toEqual({ success: true });
  });

  it('marks their own thread read for a driver', async () => {
    const result = await controller.markRead({ tenantId: 't', role: 'DRIVER', driverId: 'DRV-001' }, 'DRV-001');
    expect(svc.markRead).toHaveBeenCalledWith(1, 'DRV-001', 'driver');
    expect(result).toEqual({ success: true });
  });
});
