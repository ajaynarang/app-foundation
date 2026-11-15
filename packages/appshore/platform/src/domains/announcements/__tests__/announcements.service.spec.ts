import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from '../announcements.service';
import { countInMemory, findManyInMemory } from '../../../test/helpers/prisma-where';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: any;
  let cache: any;

  const mockAnnouncement = {
    id: 1,
    publicId: '0190f1c2-0000-7000-8000-000000000001',
    title: 'Test',
    body: 'Body',
    targetType: 'ALL',
    targetIds: [],
    priority: 'INFO',
    status: 'DRAFT',
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 7,
    createdBy: {
      userId: 'usr_admin',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
    },
  };

  beforeEach(() => {
    prisma = {
      announcement: {
        findMany: jest.fn().mockResolvedValue([mockAnnouncement]),
        findFirst: jest.fn().mockResolvedValue(mockAnnouncement),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockAnnouncement),
        update: jest.fn().mockResolvedValue(mockAnnouncement),
      },
    };

    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
    };

    service = new AnnouncementsService(prisma, cache);
  });

  describe('findAll', () => {
    it('returns one CursorList page of serialized broadcasts — no Int PK, no User PK', async () => {
      const result = await service.findAll();
      const { createdById: _hidden, id: _pk, ...publicShape } = mockAnnouncement;
      expect(result).toEqual({ items: [publicShape], nextCursor: null, total: 1 });
      expect(prisma.announcement.findMany).toHaveBeenCalledWith({
        where: {},
        include: expect.any(Object),
        orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
        take: 51,
      });
    });

    it('serializes the author by public userId — no User PK leaves the API', async () => {
      const { items } = await service.findAll();
      expect(items[0]).not.toHaveProperty('createdById');
      expect(items[0]).not.toHaveProperty('id');
      expect(items[0].createdBy).toEqual({
        userId: 'usr_admin',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@test.com',
      });
    });

    it('filters by status in the page and the total', async () => {
      await service.findAll({ status: 'PUBLISHED' as never });
      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PUBLISHED' } }),
      );
      expect(prisma.announcement.count).toHaveBeenCalledWith({ where: { status: 'PUBLISHED' } });
    });

    it('clamps the limit (0 → 1, 9999 → 100, junk → 50)', async () => {
      for (const [limit, take] of [
        ['0', 2],
        ['9999', 101],
        ['abc', 51],
      ] as const) {
        prisma.announcement.findMany.mockClear();
        await service.findAll({ limit });
        expect(prisma.announcement.findMany.mock.calls[0][0].take).toBe(take);
      }
    });

    it('a malformed cursor is a 400 before any query', async () => {
      await expect(service.findAll({ cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.announcement.findMany).not.toHaveBeenCalled();
    });

    it('walks every row once across pages, ties on one millisecond included', async () => {
      const at = new Date('2026-10-01T10:00:00.000Z');
      const rows = Array.from({ length: 5 }, (_, i) => ({
        ...mockAnnouncement,
        id: i + 1,
        publicId: `0190f1c2-0000-7000-8000-00000000000${i}`,
        createdAt: i < 3 ? at : new Date(at.getTime() - 1000 * i),
      }));
      prisma.announcement.findMany.mockImplementation((args: any) => Promise.resolve(findManyInMemory(rows, args)));
      prisma.announcement.count.mockImplementation((args: any) => Promise.resolve(countInMemory(rows, args)));
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await service.findAll({ limit: '2', cursor });
        expect(page.total).toBe(5);
        seen.push(...page.items.map((item) => item.publicId));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });
  });

  describe('findOne', () => {
    it('reads by public id and serializes', async () => {
      const result = await service.findOne(mockAnnouncement.publicId);
      expect(result.publicId).toBe(mockAnnouncement.publicId);
      expect(result).not.toHaveProperty('createdById');
      expect(prisma.announcement.findFirst).toHaveBeenCalledWith({
        where: { publicId: mockAnnouncement.publicId },
        include: expect.any(Object),
      });
    });

    it('an unknown public id is a 404', async () => {
      prisma.announcement.findFirst.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create an announcement and invalidate cache', async () => {
      const dto = { title: 'Test', body: 'Body' };
      await service.create(dto, 1);
      expect(prisma.announcement.create).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });

    it('should use defaults for optional fields', async () => {
      const dto = { title: 'Test', body: 'Body' };
      await service.create(dto, 1);
      const createCall = prisma.announcement.create.mock.calls[0][0];
      expect(createCall.data.targetType).toBe('ALL');
      expect(createCall.data.targetIds).toEqual([]);
      expect(createCall.data.priority).toBe('INFO');
    });
  });

  describe('update', () => {
    it('should update an announcement and invalidate cache', async () => {
      const dto = { title: 'Updated' };
      await service.update(mockAnnouncement.publicId, dto);
      expect(prisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: 'Updated' },
        include: expect.any(Object),
      });
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('should set status to PUBLISHED', async () => {
      await service.publish(mockAnnouncement.publicId);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('writes by an unknown public id', () => {
    it('are a 404, never a Prisma error', async () => {
      prisma.announcement.findFirst.mockResolvedValue(null);
      await expect(service.update('nope', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.publish('nope')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.archive('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.announcement.update).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('should set status to ARCHIVED', async () => {
      await service.archive(mockAnnouncement.publicId);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        }),
      );
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('findActiveForTenant', () => {
    it('caps the banner AFTER the audience filter and the priority sort — a targeted CRITICAL is never cut', async () => {
      const others = Array.from({ length: 30 }, (_, i) => ({
        ...mockAnnouncement,
        publicId: `other-${i}`,
        targetType: 'TENANT',
        targetIds: ['someone_else'],
        priority: 'INFO',
      }));
      const mine = {
        ...mockAnnouncement,
        publicId: 'mine',
        targetType: 'TENANT',
        targetIds: ['tenant_abc'],
        priority: 'CRITICAL',
      };
      const general = Array.from({ length: 25 }, (_, i) => ({
        ...mockAnnouncement,
        publicId: `all-${i}`,
        targetType: 'ALL',
        priority: 'INFO',
      }));
      prisma.announcement.findMany.mockResolvedValue([...others, ...general, mine]);

      const result = await service.findActiveForTenant('tenant_abc');

      expect(prisma.announcement.findMany.mock.calls[0][0].take).toBe(500);
      expect(result).toHaveLength(20);
      expect(result[0].publicId).toBe('mine');
      expect(result.some((a: any) => a.targetIds.includes('someone_else'))).toBe(false);
    });

    it('should return ALL-targeted announcements', async () => {
      prisma.announcement.findMany.mockResolvedValue([
        {
          ...mockAnnouncement,
          targetType: 'ALL',
          status: 'PUBLISHED',
          priority: 'INFO',
        },
      ]);
      const result = await service.findActiveForTenant('tenant_abc');
      expect(result).toHaveLength(1);
    });

    it('should return TENANT-targeted announcements matching tenantId', async () => {
      prisma.announcement.findMany.mockResolvedValue([
        {
          ...mockAnnouncement,
          targetType: 'TENANT',
          targetIds: ['tenant_abc'],
          status: 'PUBLISHED',
          priority: 'INFO',
        },
      ]);
      const result = await service.findActiveForTenant('tenant_abc');
      expect(result).toHaveLength(1);
    });

    it('should return PLAN-targeted announcements matching planSlug', async () => {
      prisma.announcement.findMany.mockResolvedValue([
        {
          ...mockAnnouncement,
          targetType: 'PLAN',
          targetIds: ['starter'],
          status: 'PUBLISHED',
          priority: 'INFO',
        },
      ]);
      const result = await service.findActiveForTenant('tenant_abc', 'starter');
      expect(result).toHaveLength(1);
    });

    it('should exclude non-matching announcements', async () => {
      prisma.announcement.findMany.mockResolvedValue([
        {
          ...mockAnnouncement,
          targetType: 'TENANT',
          targetIds: ['other_tenant'],
          status: 'PUBLISHED',
          priority: 'INFO',
        },
      ]);
      const result = await service.findActiveForTenant('tenant_abc');
      expect(result).toHaveLength(0);
    });
  });

  describe('findActiveForAllOnly', () => {
    it('should return only ALL-targeted announcements', async () => {
      prisma.announcement.findMany.mockResolvedValue([
        {
          ...mockAnnouncement,
          targetType: 'ALL',
          status: 'PUBLISHED',
          priority: 'INFO',
        },
        {
          ...mockAnnouncement,
          targetType: 'TENANT',
          targetIds: ['t1'],
          status: 'PUBLISHED',
          priority: 'INFO',
        },
      ]);
      const result = await service.findActiveForAllOnly();
      expect(result).toHaveLength(1);
      expect(result[0].targetType).toBe('ALL');
    });
  });
});
