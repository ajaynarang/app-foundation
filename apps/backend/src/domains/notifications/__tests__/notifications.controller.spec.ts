import { Test } from '@nestjs/testing';
import { NotificationsController } from '../notifications.controller';
import { InAppNotificationService } from '../notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: any;

  const mockUser = { dbId: 42 };

  beforeEach(async () => {
    service = {
      listForUser: jest.fn().mockResolvedValue({ notifications: [], total: 0 }),
      getUnreadCount: jest.fn().mockResolvedValue({ count: 5 }),
      markAsRead: jest.fn().mockResolvedValue({ success: true }),
      dismiss: jest.fn().mockResolvedValue({ success: true }),
      markAsUnread: jest.fn().mockResolvedValue({ success: true }),
      markAllRead: jest.fn().mockResolvedValue({ count: 10 }),
      dismissAllRead: jest.fn().mockResolvedValue({ count: 3 }),
    };

    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: InAppNotificationService, useValue: service }],
    }).compile();

    controller = module.get(NotificationsController);
  });

  it('should list notifications with filters', async () => {
    await controller.list(mockUser, 'unread', 'alert', '1', '20');
    expect(service.listForUser).toHaveBeenCalledWith(42, {
      status: 'unread',
      category: 'alert',
      page: 1,
      limit: 20,
    });
  });

  it('should list notifications with defaults', async () => {
    await controller.list(mockUser);
    expect(service.listForUser).toHaveBeenCalledWith(42, {
      status: undefined,
      category: undefined,
      page: undefined,
      limit: undefined,
    });
  });

  it('should get unread count', async () => {
    const result = await controller.getUnreadCount(mockUser);
    expect(result).toEqual({ count: 5 });
  });

  it('should mark as read', async () => {
    await controller.markAsRead('n-1', mockUser);
    expect(service.markAsRead).toHaveBeenCalledWith('n-1', 42);
  });

  it('should dismiss', async () => {
    await controller.dismiss('n-1', mockUser);
    expect(service.dismiss).toHaveBeenCalledWith('n-1', 42);
  });

  it('should mark as unread', async () => {
    await controller.markAsUnread('n-1', mockUser);
    expect(service.markAsUnread).toHaveBeenCalledWith('n-1', 42);
  });

  it('should mark all read', async () => {
    const result = await controller.markAllRead(mockUser, {
      category: 'alert',
    });
    expect(result).toEqual({ updated: 10 });
    expect(service.markAllRead).toHaveBeenCalledWith(42, 'alert');
  });

  it('should dismiss all read', async () => {
    const result = await controller.dismissAllRead(mockUser);
    expect(result).toEqual({ updated: 3 });
  });
});
