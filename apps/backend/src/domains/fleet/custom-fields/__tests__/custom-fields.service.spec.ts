import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomFieldsService } from '../custom-fields.service';
import { CustomFieldValidatorService } from '../custom-field-validator.service';
import { CreateCustomFieldDefinitionDto } from '../dto/create-custom-field-definition.dto';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../test/mocks';

/** Build a minimal CreateCustomFieldDefinitionDto with defaults */
function makeCreateDto(overrides: Record<string, any> = {}): CreateCustomFieldDefinitionDto {
  return {
    entityType: 'LOAD',
    name: 'Seal Number',
    fieldType: 'TEXT',
    options: [],
    isRequired: false,
    driverEditable: false,
    showOnInvoice: false,
    showOnBol: false,
    ...overrides,
  } as CreateCustomFieldDefinitionDto;
}

/** Build a minimal CustomFieldDefinition-shaped object */
function makeDefinition(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    tenantId: 1,
    entityType: 'LOAD',
    fieldKey: 'seal_number',
    name: 'Seal Number',
    fieldType: 'TEXT',
    options: [],
    isRequired: false,
    driverEditable: false,
    showOnInvoice: false,
    showOnBol: false,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let validator: jest.Mocked<Pick<CustomFieldValidatorService, 'invalidateCache' | 'getDefinitions'>>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    // Add customFieldDefinition model (not in the shared mock yet)
    prisma.customFieldDefinition = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    };

    prisma.$queryRawUnsafe = jest.fn();

    validator = {
      invalidateCache: jest.fn().mockResolvedValue(undefined),
      getDefinitions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomFieldValidatorService, useValue: validator },
      ],
    }).compile();

    service = module.get<CustomFieldsService>(CustomFieldsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return active definitions ordered by sortOrder asc', async () => {
      const defs = [makeDefinition(), makeDefinition({ id: 2, sortOrder: 1 })];
      prisma.customFieldDefinition.findMany.mockResolvedValue(defs);

      const result = await service.findAll(1, 'LOAD');

      expect(prisma.customFieldDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, entityType: 'LOAD', isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a new definition and generate slugified fieldKey', async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(0);
      prisma.customFieldDefinition.findUnique.mockResolvedValue(null);
      const created = makeDefinition({ fieldKey: 'seal_number' });
      prisma.customFieldDefinition.create.mockResolvedValue(created);

      const result = await service.create(1, makeCreateDto());

      expect(prisma.customFieldDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fieldKey: 'seal_number' }),
        }),
      );
      expect(result.fieldKey).toBe('seal_number');
      expect(validator.invalidateCache).toHaveBeenCalledWith(1, 'LOAD');
    });

    it('should slugify names with special characters correctly', async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(0);
      prisma.customFieldDefinition.findUnique.mockResolvedValue(null);
      prisma.customFieldDefinition.create.mockResolvedValue(makeDefinition({ fieldKey: 'po_reference_2' }));

      await service.create(1, makeCreateDto({ name: 'PO Reference #2' }));

      expect(prisma.customFieldDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fieldKey: 'po_reference_2' }),
        }),
      );
    });

    it('should throw BadRequestException when limit of 20 is reached', async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(20);

      await expect(service.create(1, makeCreateDto({ name: 'Extra Field' }))).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when SELECT field has no options', async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(0);

      await expect(
        service.create(1, makeCreateDto({ name: 'Region', fieldType: 'SELECT', options: [] })),
      ).rejects.toThrow(BadRequestException);

      await expect(service.create(1, makeCreateDto({ name: 'Region', fieldType: 'SELECT' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when an active field with the same key exists', async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(0);
      prisma.customFieldDefinition.findUnique.mockResolvedValue(makeDefinition({ isActive: true }));

      await expect(service.create(1, makeCreateDto())).rejects.toThrow(ConflictException);
    });

    it('should reactivate a deactivated field with the same key instead of creating', async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(0);
      const deactivated = makeDefinition({ isActive: false });
      prisma.customFieldDefinition.findUnique.mockResolvedValue(deactivated);
      const reactivated = makeDefinition({ isActive: true });
      prisma.customFieldDefinition.update.mockResolvedValue(reactivated);

      const result = await service.create(1, makeCreateDto());

      expect(prisma.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: deactivated.id },
          data: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(prisma.customFieldDefinition.create).not.toHaveBeenCalled();
      expect(result.isActive).toBe(true);
      expect(validator.invalidateCache).toHaveBeenCalledWith(1, 'LOAD');
    });

    it('should set sortOrder to current active count', async () => {
      prisma.customFieldDefinition.count.mockResolvedValue(5);
      prisma.customFieldDefinition.findUnique.mockResolvedValue(null);
      prisma.customFieldDefinition.create.mockResolvedValue(makeDefinition({ sortOrder: 5 }));

      await service.create(1, makeCreateDto({ name: 'New Field' }));

      expect(prisma.customFieldDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 5 }),
        }),
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update allowed fields and invalidate cache', async () => {
      const def = makeDefinition();
      prisma.customFieldDefinition.findFirst.mockResolvedValue(def);
      const updated = makeDefinition({ name: 'Updated Name' });
      prisma.customFieldDefinition.update.mockResolvedValue(updated);

      const result = await service.update(1, 1, { name: 'Updated Name' });

      expect(prisma.customFieldDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ name: 'Updated Name' }),
        }),
      );
      expect(validator.invalidateCache).toHaveBeenCalledWith(1, def.entityType);
      expect(result.name).toBe('Updated Name');
    });

    it('should not include fieldKey or fieldType in the update payload', async () => {
      const def = makeDefinition();
      prisma.customFieldDefinition.findFirst.mockResolvedValue(def);
      prisma.customFieldDefinition.update.mockResolvedValue(def);

      await service.update(1, 1, { name: 'New Name' });

      const updateCall = prisma.customFieldDefinition.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('fieldKey');
      expect(updateCall.data).not.toHaveProperty('fieldType');
    });

    it('should throw NotFoundException when definition is not found', async () => {
      prisma.customFieldDefinition.findFirst.mockResolvedValue(null);

      await expect(service.update(1, 999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should only update fields that are provided in the dto', async () => {
      const def = makeDefinition();
      prisma.customFieldDefinition.findFirst.mockResolvedValue(def);
      prisma.customFieldDefinition.update.mockResolvedValue(def);

      await service.update(1, 1, { isRequired: true });

      const updateCall = prisma.customFieldDefinition.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ isRequired: true });
    });
  });

  // ─── deactivate ───────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('should soft-delete by setting isActive to false', async () => {
      const def = makeDefinition();
      prisma.customFieldDefinition.findFirst.mockResolvedValue(def);
      const deactivated = makeDefinition({ isActive: false });
      prisma.customFieldDefinition.update.mockResolvedValue(deactivated);

      const result = await service.deactivate(1, 1);

      expect(prisma.customFieldDefinition.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
      expect(validator.invalidateCache).toHaveBeenCalledWith(1, def.entityType);
    });

    it('should throw NotFoundException when definition is not found', async () => {
      prisma.customFieldDefinition.findFirst.mockResolvedValue(null);

      await expect(service.deactivate(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── reorder ──────────────────────────────────────────────────────────────

  describe('reorder', () => {
    it('should update sortOrder for each id in the correct order', async () => {
      const ids = [3, 1, 2];
      prisma.customFieldDefinition.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.reorder(1, { orderedIds: ids });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.customFieldDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 3, tenantId: 1 },
        data: { sortOrder: 0 },
      });
      expect(prisma.customFieldDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 1, tenantId: 1 },
        data: { sortOrder: 1 },
      });
      expect(prisma.customFieldDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 2, tenantId: 1 },
        data: { sortOrder: 2 },
      });
      expect(result).toEqual({ success: true });
    });

    it('should invalidate cache for all entity types after reorder', async () => {
      prisma.customFieldDefinition.updateMany.mockResolvedValue({ count: 1 });

      await service.reorder(1, { orderedIds: [1] });

      for (const entityType of ['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER']) {
        expect(validator.invalidateCache).toHaveBeenCalledWith(1, entityType);
      }
    });
  });

  // ─── getUsageCount ────────────────────────────────────────────────────────

  describe('getUsageCount', () => {
    it('should return 0 when definition is not found', async () => {
      prisma.customFieldDefinition.findFirst.mockResolvedValue(null);

      const result = await service.getUsageCount(1, 999);

      expect(result).toBe(0);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('should run a raw query for LOAD entity type', async () => {
      const def = makeDefinition({
        entityType: 'LOAD',
        fieldKey: 'seal_number',
      });
      prisma.customFieldDefinition.findFirst.mockResolvedValue(def);
      prisma.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(5) }]);

      const result = await service.getUsageCount(1, 1);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('loads'), 1, 'seal_number');
      expect(result).toBe(5);
    });

    it('should use the correct table for DRIVER entity type', async () => {
      const def = makeDefinition({
        entityType: 'DRIVER',
        fieldKey: 'license_class',
      });
      prisma.customFieldDefinition.findFirst.mockResolvedValue(def);
      prisma.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(3) }]);

      await service.getUsageCount(1, 2);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('drivers'), 1, 'license_class');
    });

    it('should return 0 when raw query returns no rows', async () => {
      const def = makeDefinition();
      prisma.customFieldDefinition.findFirst.mockResolvedValue(def);
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.getUsageCount(1, 1);

      expect(result).toBe(0);
    });
  });
});
