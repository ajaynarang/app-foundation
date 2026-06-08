import { Test, TestingModule } from '@nestjs/testing';
import { AccountingMappingService } from '../services/accounting-mapping.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

// Mock Prisma/pg so tests run without a real DB or generated client
jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClient {},
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('pg', () => ({ default: { Pool: jest.fn() } }));

const mockPrisma = {
  customer: {
    findMany: jest.fn(),
  },
  driver: {
    findMany: jest.fn(),
  },
  vehicle: {
    findMany: jest.fn(),
  },
  integrationEntityMapping: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  integrationExternalEntity: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  accountingAccountMapping: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
};

describe('AccountingMappingService', () => {
  let service: AccountingMappingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountingMappingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AccountingMappingService>(AccountingMappingService);
  });

  describe('autoMatchCustomers', () => {
    const tenantId = 1;
    const integrationId = 'int_test';

    it('should call upsert for exact name match with confidence 1.0', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([
        {
          id: 1,
          customerId: 'cust_1',
          companyName: 'ABC Logistics',
          contacts: [],
        },
      ]);
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      const externalCustomers = [{ id: 'qb_1', displayName: 'ABC Logistics', email: null }];

      await service.autoMatchCustomers(tenantId, integrationId, externalCustomers);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            sallyEntityId: 'cust_1',
            externalId: 'qb_1',
            matchConfidence: 1.0,
          }),
        }),
      );
    });

    it('should call upsert for fuzzy name match with confidence > 0.8', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([
        {
          id: 1,
          customerId: 'cust_1',
          companyName: 'ABC Logistics',
          contacts: [],
        },
      ]);
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      const externalCustomers = [{ id: 'qb_1', displayName: 'ABC Logistics LLC', email: null }];

      await service.autoMatchCustomers(tenantId, integrationId, externalCustomers);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledTimes(1);
      const callArgs = mockPrisma.integrationEntityMapping.upsert.mock.calls[0][0];
      expect(callArgs.create.matchConfidence).toBeGreaterThan(0.8);
    });

    it('should upsert with null externalId when similarity is below threshold', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([
        {
          id: 1,
          customerId: 'cust_1',
          companyName: 'ABC Logistics',
          contacts: [],
        },
      ]);

      const externalCustomers = [{ id: 'qb_1', displayName: 'XYZ Transportation', email: null }];

      await service.autoMatchCustomers(tenantId, integrationId, externalCustomers);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            sallyEntityId: 'cust_1',
            externalId: null,
            externalName: null,
          }),
        }),
      );
    });

    it('should match by email when names differ', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([
        {
          id: 1,
          customerId: 'cust_1',
          companyName: 'John Doe Transport',
          contacts: [{ isPrimary: true, email: 'john@doe.com' }],
        },
      ]);
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      const externalCustomers = [{ id: 'qb_1', displayName: 'JD Transport LLC', email: 'john@doe.com' }];

      await service.autoMatchCustomers(tenantId, integrationId, externalCustomers);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            sallyEntityId: 'cust_1',
            externalId: 'qb_1',
          }),
        }),
      );
    });
  });

  describe('getEntityMapping', () => {
    it('should return existing mapping', async () => {
      const mockMapping = {
        id: 1,
        tenantId: 1,
        integrationId: 'int_test',
        entityType: 'customer',
        sallyEntityId: 'cust_1',
        externalId: 'qb_1',
        externalName: 'QB Customer',
      };

      mockPrisma.integrationEntityMapping.findFirst.mockResolvedValue(mockMapping);

      const result = await service.getEntityMapping(1, 'int_test', 'customer', 'cust_1');

      expect(result).toEqual(mockMapping);
      expect(mockPrisma.integrationEntityMapping.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          integrationId: 'int_test',
          entityType: 'customer',
          sallyEntityId: 'cust_1',
        },
      });
    });

    it('should return null when no mapping exists', async () => {
      mockPrisma.integrationEntityMapping.findFirst.mockResolvedValue(null);

      const result = await service.getEntityMapping(1, 'int_test', 'customer', 'cust_unknown');

      expect(result).toBeNull();
    });
  });

  describe('confirmMapping', () => {
    it('should set confirmedAt timestamp', async () => {
      const mockNow = new Date('2026-03-03T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(mockNow);

      mockPrisma.integrationEntityMapping.update.mockResolvedValue({});

      await service.confirmMapping(1, 1);

      expect(mockPrisma.integrationEntityMapping.update).toHaveBeenCalledWith({
        where: { id: 1, tenantId: 1 },
        data: { confirmedAt: expect.any(Date) },
      });

      jest.useRealTimers();
    });
  });

  describe('getAccountMapping', () => {
    it('should return account mapping for given item type and direction', async () => {
      const mockMapping = {
        id: 1,
        tenantId: 1,
        integrationId: 'int_test',
        sallyItemType: 'LINEHAUL',
        direction: 'INCOME',
        externalAccountId: 'qb_acc_1',
        externalAccountName: 'Linehaul Revenue',
      };

      mockPrisma.accountingAccountMapping.findFirst.mockResolvedValue(mockMapping);

      const result = await service.getAccountMapping(1, 'int_test', 'LINEHAUL', 'INCOME');

      expect(result).toEqual(mockMapping);
    });
  });

  describe('createEntityMapping', () => {
    it('should upsert with correct unique key', async () => {
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      await service.createEntityMapping(1, 'int_test', 'customer', 'cust_1', 'qb_cust_1', 'ABC Logistics', 0.95);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith({
        where: {
          integrationId_entityType_sallyEntityId: {
            integrationId: 'int_test',
            entityType: 'customer',
            sallyEntityId: 'cust_1',
          },
        },
        create: expect.objectContaining({
          tenantId: 1,
          sallyEntityId: 'cust_1',
          externalId: 'qb_cust_1',
          matchConfidence: 0.95,
        }),
        update: expect.objectContaining({
          externalId: 'qb_cust_1',
          matchConfidence: 0.95,
        }),
      });
    });

    it('should set null for externalId and externalName when empty', async () => {
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      await service.createEntityMapping(1, 'int_test', 'customer', 'cust_1', '', '');

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            externalId: null,
            externalName: null,
          }),
        }),
      );
    });
  });

  describe('cacheExternalEntities', () => {
    it('should upsert all entities', async () => {
      mockPrisma.integrationExternalEntity.upsert.mockResolvedValue({});

      await service.cacheExternalEntities(1, 'int_test', 'customer', [
        { id: 'ext_1', name: 'Customer A' },
        { id: 'ext_2', name: 'Customer B' },
      ]);

      expect(mockPrisma.integrationExternalEntity.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.integrationExternalEntity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            integrationId_entityType_externalId: {
              integrationId: 'int_test',
              entityType: 'customer',
              externalId: 'ext_1',
            },
          },
          create: expect.objectContaining({
            tenantId: 1,
            externalName: 'Customer A',
          }),
        }),
      );
    });
  });

  describe('listExternalEntities', () => {
    it('should return entities ordered by name', async () => {
      const entities = [
        { id: 1, externalId: 'e1', externalName: 'A Corp' },
        { id: 2, externalId: 'e2', externalName: 'B Corp' },
      ];
      mockPrisma.integrationExternalEntity.findMany.mockResolvedValue(entities);

      const result = await service.listExternalEntities('int_test', 'customer');

      expect(result).toEqual(entities);
      expect(mockPrisma.integrationExternalEntity.findMany).toHaveBeenCalledWith({
        where: { integrationId: 'int_test', entityType: 'customer' },
        orderBy: { externalName: 'asc' },
      });
    });
  });

  describe('listEntityMappings', () => {
    it('should enrich customer mappings with companyName', async () => {
      mockPrisma.integrationEntityMapping.findMany.mockResolvedValue([{ sallyEntityId: 'cust_1', externalId: 'qb_1' }]);
      mockPrisma.customer.findMany.mockResolvedValue([{ customerId: 'cust_1', companyName: 'ABC Logistics' }]);

      const result = await service.listEntityMappings(1, 'int_test', 'customer');

      expect(result[0].sallyEntityName).toBe('ABC Logistics');
    });

    it('should enrich vendor mappings with driver name', async () => {
      mockPrisma.integrationEntityMapping.findMany.mockResolvedValue([{ sallyEntityId: 'drv_1', externalId: 'qb_v1' }]);
      mockPrisma.driver.findMany.mockResolvedValue([{ driverId: 'drv_1', name: 'John Driver' }]);

      const result = await service.listEntityMappings(1, 'int_test', 'vendor');

      expect(result[0].sallyEntityName).toBe('John Driver');
    });

    it('should enrich class mappings with vehicle unitNumber', async () => {
      mockPrisma.integrationEntityMapping.findMany.mockResolvedValue([
        { sallyEntityId: 'veh_1', externalId: 'qb_cl1' },
      ]);
      mockPrisma.vehicle.findMany.mockResolvedValue([{ vehicleId: 'veh_1', unitNumber: 'TRUCK-01' }]);

      const result = await service.listEntityMappings(1, 'int_test', 'class');

      expect(result[0].sallyEntityName).toBe('TRUCK-01');
    });

    it('should use sallyEntityId as fallback when entity not found', async () => {
      mockPrisma.integrationEntityMapping.findMany.mockResolvedValue([
        { sallyEntityId: 'cust_unknown', externalId: null },
      ]);
      mockPrisma.customer.findMany.mockResolvedValue([]);

      const result = await service.listEntityMappings(1, 'int_test', 'customer');

      expect(result[0].sallyEntityName).toBe('cust_unknown');
    });
  });

  describe('updateMapping', () => {
    it('should update externalId and externalName', async () => {
      mockPrisma.integrationEntityMapping.update.mockResolvedValue({});

      await service.updateMapping(1, 1, 'new_ext_id', 'New Name');

      expect(mockPrisma.integrationEntityMapping.update).toHaveBeenCalledWith({
        where: { id: 1, tenantId: 1 },
        data: { externalId: 'new_ext_id', externalName: 'New Name' },
      });
    });
  });

  describe('listAccountMappings', () => {
    it('should return account mappings ordered by direction and type', async () => {
      const mappings = [
        { id: 1, sallyItemType: 'LINEHAUL', direction: 'INCOME' },
        { id: 2, sallyItemType: 'DRIVER_PAY', direction: 'EXPENSE' },
      ];
      mockPrisma.accountingAccountMapping.findMany.mockResolvedValue(mappings);

      const result = await service.listAccountMappings(1, 'int_test');

      expect(result).toEqual(mappings);
      expect(mockPrisma.accountingAccountMapping.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1, integrationId: 'int_test' },
        orderBy: [{ direction: 'asc' }, { sallyItemType: 'asc' }],
      });
    });
  });

  describe('updateAccountMapping', () => {
    it('should update the external account ID and name', async () => {
      mockPrisma.accountingAccountMapping.update.mockResolvedValue({});

      await service.updateAccountMapping(1, 1, 'qb_acc_new', 'Updated Account');

      expect(mockPrisma.accountingAccountMapping.update).toHaveBeenCalledWith({
        where: { id: 1, tenantId: 1 },
        data: {
          externalAccountId: 'qb_acc_new',
          externalAccountName: 'Updated Account',
        },
      });
    });
  });

  describe('autoMatchVendors', () => {
    it('should match drivers to QB vendors by name', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([{ id: 1, driverId: 'drv_1', name: 'John Driver', email: null }]);
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      const externalVendors = [{ id: 'qb_v1', displayName: 'John Driver', email: null }];

      await service.autoMatchVendors(1, 'int_test', externalVendors);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            entityType: 'vendor',
            sallyEntityId: 'drv_1',
            externalId: 'qb_v1',
            matchConfidence: 1.0,
          }),
        }),
      );
    });
  });

  describe('autoMatchClasses', () => {
    it('should match vehicles to QB classes by unit number', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([{ id: 1, vehicleId: 'veh_1', unitNumber: 'TRUCK-01' }]);
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      const externalClasses = [{ id: 'qb_cl1', name: 'TRUCK-01' }];

      await service.autoMatchClasses(1, 'int_test', externalClasses);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            entityType: 'class',
            sallyEntityId: 'veh_1',
            externalId: 'qb_cl1',
            matchConfidence: 1.0,
          }),
        }),
      );
    });

    it('should set null externalId when no class matches', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([{ id: 1, vehicleId: 'veh_1', unitNumber: 'TRUCK-99' }]);
      mockPrisma.integrationEntityMapping.upsert.mockResolvedValue({});

      const externalClasses = [{ id: 'qb_cl1', name: 'TOTALLY-DIFFERENT' }];

      await service.autoMatchClasses(1, 'int_test', externalClasses);

      expect(mockPrisma.integrationEntityMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            externalId: null,
            externalName: null,
          }),
        }),
      );
    });
  });

  describe('createDefaultAccountMappings', () => {
    it('should create default account mappings', async () => {
      mockPrisma.accountingAccountMapping.findFirst.mockResolvedValue(null);
      mockPrisma.accountingAccountMapping.upsert.mockResolvedValue({});

      const mockAdapter = {
        createAccount: jest.fn().mockResolvedValue({ id: 'qb_acc_1' }),
      };

      await service.createDefaultAccountMappings(1, 'int_test', mockAdapter as any, 'tok', 'realm');

      // Should have called createAccount for unique account names
      expect(mockAdapter.createAccount).toHaveBeenCalled();
      expect(mockPrisma.accountingAccountMapping.upsert).toHaveBeenCalled();
    });

    it('should skip existing account mappings', async () => {
      // Return existing for all
      mockPrisma.accountingAccountMapping.findFirst.mockResolvedValue({
        id: 1,
        sallyItemType: 'LINEHAUL',
      });

      const mockAdapter = {
        createAccount: jest.fn(),
      };

      await service.createDefaultAccountMappings(1, 'int_test', mockAdapter as any, 'tok', 'realm');

      // Should not create any accounts since all exist
      expect(mockAdapter.createAccount).not.toHaveBeenCalled();
    });

    it('should reuse created accounts for multiple item types with same name', async () => {
      let callCount = 0;
      mockPrisma.accountingAccountMapping.findFirst.mockResolvedValue(null);
      mockPrisma.accountingAccountMapping.upsert.mockResolvedValue({});

      const mockAdapter = {
        createAccount: jest.fn().mockImplementation(async () => {
          callCount++;
          return { id: `qb_acc_${callCount}` };
        }),
      };

      await service.createDefaultAccountMappings(1, 'int_test', mockAdapter as any, 'tok', 'realm');

      // "Detention Revenue" is used for both DETENTION_PICKUP and DETENTION_DELIVERY
      // So createAccount should be called for unique names only (not for every item type)
      const accountNames = mockAdapter.createAccount.mock.calls.map((c: any[]) => c[2]);
      const uniqueNames = [...new Set(accountNames)];
      expect(uniqueNames.length).toBe(accountNames.length);
    });

    it('should continue on createAccount failure', async () => {
      mockPrisma.accountingAccountMapping.findFirst.mockResolvedValue(null);
      mockPrisma.accountingAccountMapping.upsert.mockResolvedValue({});

      const mockAdapter = {
        createAccount: jest.fn().mockRejectedValueOnce(new Error('QB error')).mockResolvedValue({ id: 'qb_acc_1' }),
      };

      // Should not throw
      await service.createDefaultAccountMappings(1, 'int_test', mockAdapter as any, 'tok', 'realm');

      // Should still try to create other accounts after the first failure
      // At least 2 calls (first one fails, subsequent ones succeed)
      expect(mockAdapter.createAccount.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
