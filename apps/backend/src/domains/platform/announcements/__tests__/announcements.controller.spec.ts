import { NotFoundException } from '@nestjs/common';
import { AnnouncementsController } from '../announcements.controller';

describe('AnnouncementsController', () => {
  let controller: AnnouncementsController;
  let service: any;

  const mockAnnouncement = {
    id: 1,
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
      findAll: jest.fn().mockResolvedValue([mockAnnouncement]),
      findOne: jest.fn().mockResolvedValue(mockAnnouncement),
      create: jest.fn().mockResolvedValue({ ...mockAnnouncement, id: 2 }),
      update: jest.fn().mockResolvedValue({ ...mockAnnouncement, title: 'Updated Title' }),
      publish: jest.fn().mockResolvedValue({ ...mockAnnouncement, status: 'PUBLISHED' }),
      archive: jest.fn().mockResolvedValue({ ...mockAnnouncement, status: 'ARCHIVED' }),
    };
    controller = new AnnouncementsController(service);
  });

  // ── GET / (findAll) ──

  describe('findAll', () => {
    it('returns the full list of announcements when no status filter', async () => {
      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].title).toBe('System Update');
      expect(result[0].status).toBe('DRAFT');
    });

    it('passes status filter to service', async () => {
      service.findAll.mockResolvedValue([{ ...mockAnnouncement, status: 'PUBLISHED' }]);

      const result = await controller.findAll('PUBLISHED');

      expect(service.findAll).toHaveBeenCalledWith('PUBLISHED');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('PUBLISHED');
    });

    it('returns empty array when no announcements match', async () => {
      service.findAll.mockResolvedValue([]);

      const result = await controller.findAll('ARCHIVED');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('propagates service errors', async () => {
      service.findAll.mockRejectedValue(new Error('Database error'));

      await expect(controller.findAll()).rejects.toThrow('Database error');
    });
  });

  // ── GET /:id (findOne) ──

  describe('findOne', () => {
    it('passes parsed numeric id to service and returns announcement', async () => {
      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result.id).toBe(1);
      expect(result.title).toBe('System Update');
      expect(result.body).toBe('We are updating the system.');
      expect(result.createdBy.firstName).toBe('Admin');
    });

    it('propagates NotFoundException for non-existent id', async () => {
      service.findOne.mockRejectedValue(new NotFoundException('Announcement not found'));

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
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
        id: 2,
        title: 'New Broadcast',
        body: 'Important info',
        priority: 'WARNING',
        status: 'DRAFT',
      };
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto as any, user);

      expect(service.create).toHaveBeenCalledWith(dto, 42);
      expect(result.id).toBe(2);
      expect(result.title).toBe('New Broadcast');
      expect(result.priority).toBe('WARNING');
      expect(result.status).toBe('DRAFT');
    });

    it('uses user.dbId not userId for the createdById', async () => {
      const user = { dbId: 77, userId: 'firebase-uid' };
      service.create.mockResolvedValue({ id: 3 });

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

      const result = await controller.update(1, dto);

      expect(service.update).toHaveBeenCalledWith(1, dto);
      expect(result.title).toBe('Updated Title');
      expect(result.body).toBe('We are updating the system.');
    });

    it('propagates NotFoundException on update of non-existent id', async () => {
      service.update.mockRejectedValue(new NotFoundException());

      await expect(controller.update(999, { title: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /:id/publish ──

  describe('publish', () => {
    it('passes id to service and returns published announcement', async () => {
      const published = { ...mockAnnouncement, status: 'PUBLISHED' };
      service.publish.mockResolvedValue(published);

      const result = await controller.publish(1);

      expect(service.publish).toHaveBeenCalledWith(1);
      expect(result.status).toBe('PUBLISHED');
      expect(result.id).toBe(1);
    });

    it('propagates errors when publish fails', async () => {
      service.publish.mockRejectedValue(new NotFoundException('Announcement not found'));

      await expect(controller.publish(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /:id/archive ──

  describe('archive', () => {
    it('passes id to service and returns archived announcement', async () => {
      const archived = { ...mockAnnouncement, status: 'ARCHIVED' };
      service.archive.mockResolvedValue(archived);

      const result = await controller.archive(1);

      expect(service.archive).toHaveBeenCalledWith(1);
      expect(result.status).toBe('ARCHIVED');
      expect(result.id).toBe(1);
    });

    it('propagates errors when archive fails', async () => {
      service.archive.mockRejectedValue(new Error('Already archived'));

      await expect(controller.archive(1)).rejects.toThrow('Already archived');
    });
  });
});
