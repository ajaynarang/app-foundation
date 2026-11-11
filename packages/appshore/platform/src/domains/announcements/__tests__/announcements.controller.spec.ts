import { fieldErrorsOf } from '../../../test/helpers/field-errors.helpers';
import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { BroadcastListQueryDto } from '../dto/broadcast-list-query.dto';
import { BadRequestException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { AnnouncementsController } from '../announcements.controller';

describe('AnnouncementsController', () => {
  let controller: AnnouncementsController;
  let service: any;

  const mockAnnouncement = {
    publicId: 'b1',
    title: 'System Update',
    body: 'We are updating the system.',
    status: 'DRAFT',
    priority: 'INFO',
    targetType: 'ALL',
    targetIds: [],
    createdBy: {
      id: 42,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
    },
  };

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue({ items: [mockAnnouncement], nextCursor: null, total: 1 }),
      findOne: jest.fn().mockResolvedValue(mockAnnouncement),
      create: jest.fn().mockResolvedValue({ ...mockAnnouncement, publicId: 'b2' }),
      update: jest.fn().mockResolvedValue({ ...mockAnnouncement, title: 'Updated Title' }),
      publish: jest.fn().mockResolvedValue({ ...mockAnnouncement, status: 'PUBLISHED' }),
      archive: jest.fn().mockResolvedValue({ ...mockAnnouncement, status: 'ARCHIVED' }),
    };
    controller = new AnnouncementsController(service);
  });

  // ── GET / (findAll) ──

  describe('findAll', () => {
    const read = (raw: Record<string, unknown>) => readQueryDto(BroadcastListQueryDto, raw);

    it('returns the service page with no filter', async () => {
      const result = await controller.findAll(await read({}));

      expect(service.findAll).toHaveBeenCalledWith({ status: undefined, limit: undefined, cursor: undefined });
      expect(result.items[0].publicId).toBe('b1');
      expect(result.nextCursor).toBeNull();
    });

    it('passes status, limit and cursor to the service', async () => {
      await controller.findAll(await read({ status: 'PUBLISHED', limit: '10', cursor: 'abc' }));

      expect(service.findAll).toHaveBeenCalledWith({ status: 'PUBLISHED', limit: 10, cursor: 'abc' });
    });

    it('a repeated cursor is a 400', async () => {
      await expect(read({ cursor: ['a', 'b'] })).rejects.toThrow(BadRequestException);
    });

    it('a non-numeric limit is a 400 naming it', async () => {
      await expect(read({ limit: 'abc' })).rejects.toMatchObject({
        response: expect.objectContaining({ fieldErrors: { limit: '"limit" must be a whole number' } }),
      });
    });

    it('answers 400 naming status for an unknown one (it used to be ignored and list everything)', async () => {
      expect(await fieldErrorsOf(read({ status: 'published' }))).toHaveProperty('status');
    });

    it('propagates service errors', async () => {
      service.findAll.mockRejectedValue(new Error('Database error'));

      await expect(controller.findAll(await read({}))).rejects.toThrow('Database error');
    });
  });

  // ── GET /:id (findOne) ──

  describe('findOne', () => {
    it('passes the public id to service and returns announcement', async () => {
      const result = await controller.findOne('b1');

      expect(service.findOne).toHaveBeenCalledWith('b1');
      expect(result.publicId).toBe('b1');
      expect(result.title).toBe('System Update');
      expect(result.body).toBe('We are updating the system.');
      expect(result.createdBy.firstName).toBe('Admin');
    });

    it('propagates NotFoundException for non-existent id', async () => {
      service.findOne.mockRejectedValue(new NotFoundException('Announcement not found'));

      await expect(controller.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST / (create) ──

  describe('create', () => {
    it('passes dto and user.dbId to service and returns created announcement', async () => {
      const dto = {
        title: 'New Broadcast',
        body: 'Important info',
        priority: 'WARNING',
      };
      const user = { dbId: 42 };
      const created = {
        publicId: 'b2',
        title: 'New Broadcast',
        body: 'Important info',
        priority: 'WARNING',
        status: 'DRAFT',
      };
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto as any, user);

      expect(service.create).toHaveBeenCalledWith(dto, 42);
      expect(result.publicId).toBe('b2');
      expect(result.title).toBe('New Broadcast');
      expect(result.priority).toBe('WARNING');
      expect(result.status).toBe('DRAFT');
    });

    it('uses user.dbId not userId for the createdById', async () => {
      const user = { dbId: 77, userId: 'firebase-uid' };
      service.create.mockResolvedValue({ publicId: 'b3' });

      await controller.create({ title: 'T', body: 'B' }, user);

      expect(service.create).toHaveBeenCalledWith(
        { title: 'T', body: 'B' },
        77, // dbId, not 'firebase-uid'
      );
    });

    it('propagates service errors on create', async () => {
      service.create.mockRejectedValue(new Error('Validation failed'));

      await expect(controller.create({ title: '', body: '' } as any, { dbId: 1 })).rejects.toThrow('Validation failed');
    });
  });

  // ── PATCH /:id (update) ──

  describe('update', () => {
    it('passes id and dto to service and returns updated announcement', async () => {
      const dto = { title: 'Updated Title' };
      const updated = { ...mockAnnouncement, title: 'Updated Title' };
      service.update.mockResolvedValue(updated);

      const result = await controller.update('b1', dto);

      expect(service.update).toHaveBeenCalledWith('b1', dto);
      expect(result.title).toBe('Updated Title');
      expect(result.body).toBe('We are updating the system.');
    });

    it('propagates NotFoundException on update of non-existent id', async () => {
      service.update.mockRejectedValue(new NotFoundException());

      await expect(controller.update('missing', { title: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /:id/publish ──

  describe('publish', () => {
    it('passes id to service and returns published announcement', async () => {
      const published = { ...mockAnnouncement, status: 'PUBLISHED' };
      service.publish.mockResolvedValue(published);

      const result = await controller.publish('b1');

      expect(service.publish).toHaveBeenCalledWith('b1');
      expect(result.status).toBe('PUBLISHED');
      expect(result.publicId).toBe('b1');
    });

    it('propagates errors when publish fails', async () => {
      service.publish.mockRejectedValue(new NotFoundException('Announcement not found'));

      await expect(controller.publish('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /:id/archive ──

  describe('archive', () => {
    it('passes id to service and returns archived announcement', async () => {
      const archived = { ...mockAnnouncement, status: 'ARCHIVED' };
      service.archive.mockResolvedValue(archived);

      const result = await controller.archive('b1');

      expect(service.archive).toHaveBeenCalledWith('b1');
      expect(result.status).toBe('ARCHIVED');
      expect(result.publicId).toBe('b1');
    });

    it('propagates errors when archive fails', async () => {
      service.archive.mockRejectedValue(new Error('Already archived'));

      await expect(controller.archive('b1')).rejects.toThrow('Already archived');
    });
  });
});
