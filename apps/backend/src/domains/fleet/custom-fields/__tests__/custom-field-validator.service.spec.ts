import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CustomFieldValidatorService } from '../custom-field-validator.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { createMockPrisma, createMockCache } from '../../../../test/mocks';
import { CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';

/** Build a minimal CustomFieldDefinition-shaped object */
function makeDefinition(overrides: Record<string, any> = {}) {
  return {
    id: 'def-1',
    tenantId: 1,
    entityType: 'LOAD',
    fieldKey: 'seal_number',
    name: 'Seal Number',
    fieldType: 'TEXT',
    options: [],
    isRequired: false,
    driverEditable: true,
    showOnInvoice: false,
    showOnBol: false,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CustomFieldValidatorService', () => {
  let service: CustomFieldValidatorService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = createMockCache();

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldValidatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<CustomFieldValidatorService>(CustomFieldValidatorService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getDefinitions ───────────────────────────────────────────────────────

  describe('getDefinitions', () => {
    it('should call cache.getOrSet with the correct cache key and TTL', async () => {
      const defs = [makeDefinition()];
      cache.getOrSet.mockImplementation(async (_key: string, factory: () => Promise<any>) => factory());
      prisma.customFieldDefinition.findMany.mockResolvedValue(defs);

      const result = await service.getDefinitions(1, 'LOAD');

      expect(cache.getOrSet).toHaveBeenCalledWith(
        'sally:custom-fields:1:LOAD',
        expect.any(Function),
        CACHE_TTL_WARM_5M,
      );
      expect(result).toEqual(defs);
    });

    it('should return cached value without hitting Prisma on cache hit', async () => {
      const defs = [makeDefinition()];
      cache.getOrSet.mockResolvedValue(defs);

      const result = await service.getDefinitions(1, 'LOAD');

      expect(result).toEqual(defs);
      expect(prisma.customFieldDefinition.findMany).not.toHaveBeenCalled();
    });

    it('should query active definitions ordered by sortOrder asc', async () => {
      prisma.customFieldDefinition.findMany.mockResolvedValue([]);

      await service.getDefinitions(2, 'DRIVER');

      expect(prisma.customFieldDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 2, entityType: 'DRIVER', isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
      );
    });
  });

  // ─── invalidateCache ──────────────────────────────────────────────────────

  describe('invalidateCache', () => {
    it('should delete the correct cache key', async () => {
      await service.invalidateCache(1, 'LOAD');

      expect(cache.del).toHaveBeenCalledWith('sally:custom-fields:1:LOAD');
    });
  });

  // ─── validate — no definitions ────────────────────────────────────────────

  describe('validate — no definitions', () => {
    it('should return empty values when no definitions exist', async () => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([]);

      const result = await service.validate(1, 'LOAD', { field1: 'v' });

      expect(result).toEqual({ values: {}, warnings: [] });
    });

    it('should return existing values unchanged when incomingValues is null and isCreate is false', async () => {
      const existing = { seal_number: 'ABC123' };
      const result = await service.validate(1, 'LOAD', null, {
        existingValues: existing,
        isCreate: false,
      });

      expect(result.values).toEqual(existing);
      expect(result.warnings).toEqual([]);
      // getDefinitions should NOT have been called
      expect(cache.getOrSet).not.toHaveBeenCalled();
    });
  });

  // ─── validate — unknown keys ──────────────────────────────────────────────

  describe('validate — unknown keys stripped', () => {
    it('should strip keys not matching any definition and add a warning', async () => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({ fieldKey: 'seal_number', fieldType: 'TEXT' }),
      ]);

      const result = await service.validate(1, 'LOAD', {
        seal_number: 'ABC',
        unknown_field: 'ignored',
      });

      expect(result.values).not.toHaveProperty('unknown_field');
      expect(result.warnings).toContain('Unknown custom field "unknown_field" stripped');
    });
  });

  // ─── validate — TEXT field ────────────────────────────────────────────────

  describe('validate — TEXT field', () => {
    beforeEach(() => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({ fieldKey: 'seal_number', fieldType: 'TEXT' }),
      ]);
    });

    it('should accept a valid string value', async () => {
      const result = await service.validate(1, 'LOAD', {
        seal_number: 'ABC123',
      });

      expect(result.values.seal_number).toBe('ABC123');
    });

    it('should reject a non-string value', async () => {
      await expect(service.validate(1, 'LOAD', { seal_number: 123 })).rejects.toThrow(BadRequestException);
    });

    it('should reject a string exceeding 500 characters', async () => {
      await expect(service.validate(1, 'LOAD', { seal_number: 'a'.repeat(501) })).rejects.toThrow(BadRequestException);
    });

    it('should accept a string exactly 500 characters', async () => {
      const result = await service.validate(1, 'LOAD', {
        seal_number: 'a'.repeat(500),
      });

      expect(result.values.seal_number).toHaveLength(500);
    });
  });

  // ─── validate — NUMBER field ──────────────────────────────────────────────

  describe('validate — NUMBER field', () => {
    beforeEach(() => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({
          fieldKey: 'weight',
          name: 'Weight',
          fieldType: 'NUMBER',
        }),
      ]);
    });

    it('should accept a numeric value', async () => {
      const result = await service.validate(1, 'LOAD', { weight: 42.5 });

      expect(result.values.weight).toBe(42.5);
    });

    it('should coerce a numeric string to a number', async () => {
      const result = await service.validate(1, 'LOAD', { weight: '123.45' });

      expect(result.values.weight).toBe(123.45);
    });

    it('should reject a non-numeric string', async () => {
      await expect(service.validate(1, 'LOAD', { weight: 'not-a-number' })).rejects.toThrow(BadRequestException);
    });

    it('should reject NaN', async () => {
      await expect(service.validate(1, 'LOAD', { weight: NaN })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── validate — DATE field ────────────────────────────────────────────────

  describe('validate — DATE field', () => {
    beforeEach(() => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({
          fieldKey: 'pickup_date',
          name: 'Pickup Date',
          fieldType: 'DATE',
        }),
      ]);
    });

    it('should accept a valid YYYY-MM-DD string', async () => {
      const result = await service.validate(1, 'LOAD', {
        pickup_date: '2024-06-15',
      });

      expect(result.values.pickup_date).toBe('2024-06-15');
    });

    it('should reject an invalid date format (MM/DD/YYYY)', async () => {
      await expect(service.validate(1, 'LOAD', { pickup_date: '06/15/2024' })).rejects.toThrow(BadRequestException);
    });

    it('should reject a non-string value', async () => {
      await expect(service.validate(1, 'LOAD', { pickup_date: 20240615 })).rejects.toThrow(BadRequestException);
    });

    it('should reject a partial date string', async () => {
      await expect(service.validate(1, 'LOAD', { pickup_date: '2024-06' })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── validate — SELECT field ──────────────────────────────────────────────

  describe('validate — SELECT field', () => {
    beforeEach(() => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({
          fieldKey: 'region',
          name: 'Region',
          fieldType: 'SELECT',
          options: ['East', 'West', 'Central'],
        }),
      ]);
    });

    it('should accept a value that is in the allowed options', async () => {
      const result = await service.validate(1, 'LOAD', { region: 'East' });

      expect(result.values.region).toBe('East');
    });

    it('should reject a value not in the allowed options', async () => {
      await expect(service.validate(1, 'LOAD', { region: 'North' })).rejects.toThrow(BadRequestException);
    });

    it('should reject a non-string value', async () => {
      await expect(service.validate(1, 'LOAD', { region: 1 })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── validate — null/empty clearing ───────────────────────────────────────

  describe('validate — null/empty value clears field', () => {
    beforeEach(() => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({ fieldKey: 'seal_number', fieldType: 'TEXT' }),
      ]);
    });

    it('should set field to null when value is null', async () => {
      const result = await service.validate(
        1,
        'LOAD',
        { seal_number: null },
        { existingValues: { seal_number: 'OLD' } },
      );

      expect(result.values.seal_number).toBeNull();
    });

    it('should set field to null when value is undefined', async () => {
      const result = await service.validate(
        1,
        'LOAD',
        { seal_number: undefined },
        { existingValues: { seal_number: 'OLD' } },
      );

      expect(result.values.seal_number).toBeNull();
    });

    it('should set field to null when value is empty string', async () => {
      const result = await service.validate(1, 'LOAD', { seal_number: '' }, { existingValues: { seal_number: 'OLD' } });

      expect(result.values.seal_number).toBeNull();
    });
  });

  // ─── validate — required fields on create ────────────────────────────────

  describe('validate — required field enforcement on create', () => {
    beforeEach(() => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({
          fieldKey: 'seal_number',
          name: 'Seal Number',
          fieldType: 'TEXT',
          isRequired: true,
        }),
      ]);
    });

    it('should throw BadRequestException when required field is missing on create', async () => {
      await expect(service.validate(1, 'LOAD', {}, { isCreate: true })).rejects.toThrow(BadRequestException);
    });

    it('should throw when required field value is null on create', async () => {
      await expect(service.validate(1, 'LOAD', { seal_number: null }, { isCreate: true })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should NOT throw when required field is missing on update (isCreate=false)', async () => {
      const result = await service.validate(1, 'LOAD', {}, { isCreate: false });

      expect(result.values).toBeDefined();
    });

    it('should pass when required field has a value on create', async () => {
      const result = await service.validate(1, 'LOAD', { seal_number: 'ABC' }, { isCreate: true });

      expect(result.values.seal_number).toBe('ABC');
    });
  });

  // ─── validate — driver context ────────────────────────────────────────────

  describe('validate — driver context', () => {
    beforeEach(() => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({
          fieldKey: 'internal_notes',
          name: 'Internal Notes',
          fieldType: 'TEXT',
          driverEditable: false,
        }),
        makeDefinition({
          id: 'def-2',
          fieldKey: 'driver_comment',
          name: 'Driver Comment',
          fieldType: 'TEXT',
          driverEditable: true,
        }),
      ]);
    });

    it('should skip non-driverEditable fields in driver context', async () => {
      const result = await service.validate(
        1,
        'LOAD',
        { internal_notes: 'secret', driver_comment: 'hello' },
        { context: 'driver' },
      );

      // Non-editable field should be excluded even if provided
      expect(result.values).not.toHaveProperty('internal_notes');
      expect(result.values.driver_comment).toBe('hello');
    });

    it('should not enforce required on non-driverEditable fields in driver context', async () => {
      // Make internal_notes required but not driver-editable
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({
          fieldKey: 'internal_notes',
          name: 'Internal Notes',
          fieldType: 'TEXT',
          driverEditable: false,
          isRequired: true,
        }),
      ]);

      // Should not throw even though required field is missing
      const result = await service.validate(
        1,
        'LOAD',
        {},
        {
          context: 'driver',
          isCreate: true,
        },
      );

      expect(result.values).toBeDefined();
    });

    it('should allow all fields in dispatcher context', async () => {
      const result = await service.validate(
        1,
        'LOAD',
        { internal_notes: 'dispatch-only', driver_comment: 'hi' },
        { context: 'dispatcher' },
      );

      expect(result.values.internal_notes).toBe('dispatch-only');
      expect(result.values.driver_comment).toBe('hi');
    });
  });

  // ─── validate — merge with existing values ────────────────────────────────

  describe('validate — merge with existing values on update', () => {
    it('should preserve existing values for fields not in the incoming payload', async () => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({ fieldKey: 'seal_number', fieldType: 'TEXT' }),
        makeDefinition({
          id: 'def-2',
          fieldKey: 'weight',
          name: 'Weight',
          fieldType: 'NUMBER',
        }),
      ]);

      const result = await service.validate(
        1,
        'LOAD',
        { seal_number: 'NEW' },
        { existingValues: { seal_number: 'OLD', weight: 99 } },
      );

      expect(result.values.seal_number).toBe('NEW');
      expect(result.values.weight).toBe(99);
    });

    it('should strip legacy keys from existing values that no longer have definitions', async () => {
      cache.getOrSet.mockImplementation(async (_k: string, fn: () => Promise<any>) => fn());
      // Only seal_number definition is active
      prisma.customFieldDefinition.findMany.mockResolvedValue([
        makeDefinition({ fieldKey: 'seal_number', fieldType: 'TEXT' }),
      ]);

      const result = await service.validate(
        1,
        'LOAD',
        { seal_number: 'ABC' },
        { existingValues: { seal_number: 'OLD', deactivated_field: 'gone' } },
      );

      expect(result.values).not.toHaveProperty('deactivated_field');
    });
  });
});
