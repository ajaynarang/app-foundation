import { AnnouncementsService } from '../announcements.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: any;
  let cache: any;

  const mockAnnouncement = {
    id: 1,
    title: 'Test',
    body: 'Body',
    targetType: 'ALL',
    targetIds: [],
    priority: 'INFO',
    status: 'DRAFT',
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    createdBy: {
      id: 1,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
    },
  };

  beforeEach(() => {
    prisma = {
      announcement: {
        findMany: jest.fn().mockResolvedValue([mockAnnouncement]),
        findUniqueOrThrow: jest.fn().mockResolvedValue(mockAnnouncement),
        create: jest.fn().mockResolvedValue(mockAnnouncement),
        update: jest.fn().mockResolvedValue(mockAnnouncement),
      },
    };

    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
    };

    service = new AnnouncementsService(prisma as unknown as PrismaService, cache as unknown as AppCacheService);
  });

  describe('findAll', () => {
    it('should return all announcements', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockAnnouncement]);
      expect(prisma.announcement.findMany).toHaveBeenCalledWith({
        where: {},
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by status', async () => {
      await service.findAll('PUBLISHED');
      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PUBLISHED' } }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a single announcement', async () => {
      const result = await service.findOne(1);
      expect(result).toEqual(mockAnnouncement);
      expect(prisma.announcement.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 1 },
        include: expect.any(Object),
      });
    });
  });

  describe('create', () => {
    it('should create an announcement and invalidate cache', async () => {
      const dto = { title: 'Test', body: 'Body' };
      await service.create(dto as any, 1);
      expect(prisma.announcement.create).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });

    it('should use defaults for optional fields', async () => {
      const dto = { title: 'Test', body: 'Body' };
      await service.create(dto as any, 1);
      const createCall = prisma.announcement.create.mock.calls[0][0];
      expect(createCall.data.targetType).toBe('ALL');
      expect(createCall.data.targetIds).toEqual([]);
      expect(createCall.data.priority).toBe('INFO');
    });
  });

  describe('update', () => {
    it('should update an announcement and invalidate cache', async () => {
      const dto = { title: 'Updated' };
      await service.update(1, dto as any);
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
      await service.publish(1);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('should set status to ARCHIVED', async () => {
      await service.archive(1);
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ARCHIVED' },
        }),
      );
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('findActiveForTenant', () => {
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
