import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf, readBodyDto } from '@appshore/platform/test/helpers/field-errors.helpers';
import { MarkAllReadDto } from '../dto/mark-all-read.dto';
import { NotificationListQueryDto } from '../dto/notification-list-query.dto';
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
    await controller.list(
      mockUser,
      await readQueryDto(NotificationListQueryDto, {
        status: 'unread',
        category: 'BILLING',
        cursor: 'abc',
        limit: '20',
      }),
    );
    expect(service.listForUser).toHaveBeenCalledWith(42, {
      status: 'unread',
      category: 'BILLING',
      limit: 20,
      cursor: 'abc',
    });
  });

  it('should list notifications with defaults', async () => {
    await controller.list(mockUser, await readQueryDto(NotificationListQueryDto, {}));
    expect(service.listForUser).toHaveBeenCalledWith(42, {
      status: undefined,
      category: undefined,
      limit: undefined,
      cursor: undefined,
    });
  });

  it('answers 400 naming an unknown status or category, a limit that is not a number, or page paging', async () => {
    const read = (raw: Record<string, unknown>) => readQueryDto(NotificationListQueryDto, raw);
    expect(await fieldErrorsOf(read({ status: 'seen' }))).toHaveProperty('status');
    expect(await fieldErrorsOf(read({ category: 'alert' }))).toHaveProperty('category');
    // The inbox is a cursor list: `page` is refused like any key the route does not declare.
    expect(await fieldErrorsOf(read({ page: '2' }))).toHaveProperty('page');
    expect(await fieldErrorsOf(read({ limit: 'abc' }))).toHaveProperty('limit');
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
    const result = await controller.markAllRead(mockUser, await readBodyDto(MarkAllReadDto, { category: 'TEAM' }));
    expect(result).toEqual({ updated: 10 });
    expect(service.markAllRead).toHaveBeenCalledWith(42, 'TEAM');
  });

  it('answers 400 naming category for an unknown one, and refuses an undeclared field', async () => {
    expect(await fieldErrorsOf(readBodyDto(MarkAllReadDto, { category: 'alert' }))).toHaveProperty('category');
    expect(await fieldErrorsOf(readBodyDto(MarkAllReadDto, { everything: true }))).toHaveProperty('everything');
  });

  it('should dismiss all read', async () => {
    const result = await controller.dismissAllRead(mockUser);
    expect(result).toEqual({ updated: 3 });
  });
});
