import { Test, TestingModule } from '@nestjs/testing';
import { CustomFieldsController } from '../custom-fields.controller';
import { CustomFieldsService } from '../custom-fields.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('CustomFieldsController', () => {
  let controller: CustomFieldsController;

  const mockTenant = { id: 42, tenantId: 'tenant-abc' };

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-abc',
    role: 'ADMIN',
  };

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(mockTenant),
    },
  };

  const mockCustomFieldsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reorder: jest.fn(),
    getUsageCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomFieldsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CustomFieldsService, useValue: mockCustomFieldsService },
      ],
    }).compile();

    controller = module.get<CustomFieldsController>(CustomFieldsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── POST / (create) ──────────────────────────────────────────────────────

  describe('POST / (create)', () => {
    it('should resolve tenantDbId and call customFieldsService.create', async () => {
      const dto = {
        entityType: 'LOAD',
        name: 'Seal Number',
        fieldType: 'TEXT',
      } as any;
      const definition = { id: 1, fieldKey: 'seal_number' };
      mockCustomFieldsService.create.mockResolvedValue(definition);

      const result = await controller.create(mockUser, dto);

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-abc' },
      });
      expect(mockCustomFieldsService.create).toHaveBeenCalledWith(42, dto);
      expect(result).toEqual(definition);
    });
  });

  // ─── GET / (list) ─────────────────────────────────────────────────────────

  describe('GET / (list)', () => {
    it('should resolve tenantDbId and call customFieldsService.findAll', async () => {
      const definitions = [{ id: 1 }, { id: 2 }];
      mockCustomFieldsService.findAll.mockResolvedValue(definitions);

      const result = await controller.list(mockUser, 'LOAD');

      expect(mockCustomFieldsService.findAll).toHaveBeenCalledWith(42, 'LOAD');
      expect(result).toEqual(definitions);
    });

    it('should pass entityType query param to the service', async () => {
      mockCustomFieldsService.findAll.mockResolvedValue([]);

      await controller.list(mockUser, 'DRIVER');

      expect(mockCustomFieldsService.findAll).toHaveBeenCalledWith(42, 'DRIVER');
    });
  });

  // ─── PATCH /reorder ───────────────────────────────────────────────────────

  describe('PATCH /reorder', () => {
    it('should resolve tenantDbId and call customFieldsService.reorder', async () => {
      const dto = { orderedIds: [2, 1] } as any;
      mockCustomFieldsService.reorder.mockResolvedValue({ success: true });

      const result = await controller.reorder(mockUser, dto);

      expect(mockCustomFieldsService.reorder).toHaveBeenCalledWith(42, dto);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── PATCH /:id (update) ──────────────────────────────────────────────────

  describe('PATCH /:id (update)', () => {
    it('should resolve tenantDbId and call customFieldsService.update with id', async () => {
      const dto = { name: 'Updated Name' } as any;
      const updated = { id: 1, name: 'Updated Name' };
      mockCustomFieldsService.update.mockResolvedValue(updated);

      const result = await controller.update(mockUser, 1, dto);

      expect(mockCustomFieldsService.update).toHaveBeenCalledWith(42, 1, dto);
      expect(result).toEqual(updated);
    });
  });

  // ─── DELETE /:id (deactivate) ─────────────────────────────────────────────

  describe('DELETE /:id (deactivate)', () => {
    it('should resolve tenantDbId and call customFieldsService.deactivate', async () => {
      const deactivated = { id: 1, isActive: false };
      mockCustomFieldsService.deactivate.mockResolvedValue(deactivated);

      const result = await controller.deactivate(mockUser, 1);

      expect(mockCustomFieldsService.deactivate).toHaveBeenCalledWith(42, 1);
      expect(result).toEqual(deactivated);
    });
  });

  // ─── GET /:id/usage ───────────────────────────────────────────────────────

  describe('GET /:id/usage', () => {
    it('should return usage count wrapped in { count }', async () => {
      mockCustomFieldsService.getUsageCount.mockResolvedValue(7);

      const result = await controller.getUsage(mockUser, 1);

      expect(mockCustomFieldsService.getUsageCount).toHaveBeenCalledWith(42, 1);
      expect(result).toEqual({ count: 7 });
    });

    it('should return { count: 0 } when no usages found', async () => {
      mockCustomFieldsService.getUsageCount.mockResolvedValue(0);

      const result = await controller.getUsage(mockUser, 1);

      expect(result).toEqual({ count: 0 });
    });
  });

  // ─── getTenantDbId resolution ─────────────────────────────────────────────

  describe('getTenantDbId resolution', () => {
    it('should use user.tenantId to look up the tenant DB id', async () => {
      mockCustomFieldsService.findAll.mockResolvedValue([]);

      await controller.list(mockUser, 'LOAD');

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: mockUser.tenantId },
      });
    });
  });
});
