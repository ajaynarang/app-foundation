import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AccountingSyncService } from '../services/accounting-sync.service';

// Mock Prisma/pg so tests run without a real DB or generated client
jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClient {},
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('pg', () => ({ default: { Pool: jest.fn() } }));
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AccountingMappingService } from '../services/accounting-mapping.service';
import { QuickBooksAdapter } from '../vendors/quickbooks/quickbooks.adapter';
import { AuthTokenService } from '../../oauth/auth-token.service';

const mockPrisma = {
  integrationConfig: {
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({}),
  },
  invoice: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  settlement: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  customer: {
    findFirst: jest.fn(),
  },
  driver: {
    findFirst: jest.fn(),
  },
  vehicle: {
    findFirst: jest.fn(),
  },
  integrationEntityMapping: {
    count: jest.fn().mockResolvedValue(0),
  },
};

const mockAuthTokenService = {
  getActiveToken: jest.fn(),
  decryptCredentials: jest.fn(),
};

const mockMappingService = {
  getEntityMapping: jest.fn(),
  createEntityMapping: jest.fn(),
  getAccountMapping: jest.fn(),
  cacheExternalEntities: jest.fn().mockResolvedValue(undefined),
  autoMatchCustomers: jest.fn(),
  autoMatchVendors: jest.fn(),
  autoMatchClasses: jest.fn(),
};

const mockAdapter = {
  syncInvoice: jest.fn(),
  syncBill: jest.fn(),
  syncPayment: jest.fn(),
  syncBillPayment: jest.fn(),
  createCustomer: jest.fn(),
  createVendor: jest.fn(),
  createClass: jest.fn(),
  fetchCustomers: jest.fn(),
  fetchVendors: jest.fn(),
  fetchClasses: jest.fn(),
};

const ACTIVE_CONFIG = {
  id: 1,
  tenantId: 1,
  integrationId: 'int_qb_1',
  integrationType: 'ACCOUNTING',
  vendor: 'QUICKBOOKS',
  isEnabled: true,
  status: 'ACTIVE',
  credentials: 'encrypted_creds',
  realmId: 'realm_123',
};

describe('AccountingSyncService', () => {
  let service: AccountingSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: AuthTokenService returns a valid token
    mockAuthTokenService.getActiveToken.mockResolvedValue('tok_access');
    mockAuthTokenService.decryptCredentials.mockReturnValue({
      authMethod: 'oauth',
      accessToken: 'tok_access',
      refreshToken: 'tok_refresh',
      realmId: 'realm_123',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    // Default: active config found
    mockPrisma.integrationConfig.findFirst.mockResolvedValue(ACTIVE_CONFIG);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountingMappingService, useValue: mockMappingService },
        { provide: QuickBooksAdapter, useValue: mockAdapter },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
      ],
    }).compile();

    service = module.get<AccountingSyncService>(AccountingSyncService);
  });

  // ---------------------------------------------------------------------------
  // getAdapterAndToken
  // ---------------------------------------------------------------------------

  describe('getAdapterAndToken', () => {
    it('should return adapter, accessToken, realmId, and integrationId', async () => {
      const result = await service.getAdapterAndToken(1);

      expect(result.integrationId).toBe('int_qb_1');
      expect(result.accessToken).toBe('tok_access');
      expect(result.realmId).toBe('realm_123');
      expect(mockAuthTokenService.getActiveToken).toHaveBeenCalled();
    });

    it('should throw NotFoundException when no active config found', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);

      await expect(service.getAdapterAndToken(1)).rejects.toThrow(NotFoundException);
    });

    it('should throw when credentials not configured', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        ...ACTIVE_CONFIG,
        credentials: null,
      });

      await expect(service.getAdapterAndToken(1)).rejects.toThrow(
        'QuickBooks integration credentials are not configured',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // syncInvoice
  // ---------------------------------------------------------------------------

  describe('syncInvoice', () => {
    const mockInvoice = {
      id: 10,
      invoiceNumber: 'INV-001',
      tenantId: 1,
      issueDate: new Date('2026-03-01'),
      dueDate: new Date('2026-03-31'),
      externalInvoiceId: null,
      externalSyncedAt: null,
      customer: {
        customerId: 'cust_1',
        companyName: 'ABC Logistics',
        contacts: [{ isPrimary: true, email: 'abc@logistics.com' }],
      },
      lineItems: [{ type: 'LINEHAUL', description: 'Linehaul', totalCents: 100000 }],
      load: {
        vehicle: { vehicleId: 'veh_1', unitNumber: 'TRUCK-01' },
      },
    };

    beforeEach(() => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      // Customer not yet mapped → service will look up customer from DB
      mockMappingService.getEntityMapping.mockResolvedValue(null);
      mockPrisma.customer.findFirst.mockResolvedValue({
        customerId: 'cust_1',
        companyName: 'ABC Logistics',
        contacts: [{ isPrimary: true, email: 'abc@logistics.com' }],
      });
      mockAdapter.createCustomer.mockResolvedValue({
        id: 'qb_cust_1',
        displayName: 'ABC Logistics',
      });
      mockMappingService.createEntityMapping.mockResolvedValue({});
      // Class not mapped
      mockPrisma.vehicle.findFirst.mockResolvedValue({
        vehicleId: 'veh_1',
        unitNumber: 'TRUCK-01',
      });
      mockAdapter.createClass.mockResolvedValue({
        id: 'qb_class_1',
        name: 'TRUCK-01',
      });
      mockMappingService.getAccountMapping.mockResolvedValue(null);
      mockAdapter.syncInvoice.mockResolvedValue({
        success: true,
        externalId: 'qb_inv_1',
      });
      mockPrisma.invoice.update.mockResolvedValue({});
    });

    it('should sync invoice and update externalInvoiceId', async () => {
      const result = await service.syncInvoice(1, 'inv_1');

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb_inv_1');
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          externalInvoiceId: 'qb_inv_1',
          externalSyncError: null,
        }),
      });
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.syncInvoice(1, 'inv_unknown')).rejects.toThrow(NotFoundException);
    });

    it('should store sync error when adapter fails', async () => {
      mockAdapter.syncInvoice.mockResolvedValue({
        success: false,
        error: 'QB API error',
      });

      const result = await service.syncInvoice(1, 'inv_1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('QB API error');
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          externalSyncError: 'QB API error',
        }),
      });
    });

    it('should use existing customer mapping if already mapped', async () => {
      mockMappingService.getEntityMapping.mockResolvedValue({
        externalId: 'qb_cust_existing',
        externalName: 'ABC Logistics',
      });

      await service.syncInvoice(1, 'inv_1');

      expect(mockAdapter.createCustomer).not.toHaveBeenCalled();
    });

    it('should persist QB SyncToken returned by adapter into externalSyncVersion', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        ...mockInvoice,
        externalInvoiceId: 'qb_inv_1',
        externalSyncVersion: '3',
      });
      mockAdapter.syncInvoice.mockResolvedValue({
        success: true,
        externalId: 'qb_inv_1',
        syncToken: '4',
      });

      await service.syncInvoice(1, 'inv_1');

      expect(mockAdapter.syncInvoice).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ existingSyncToken: '3' }),
      );
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({ externalSyncVersion: '4' }),
      });
    });

    it('should preserve prior externalSyncVersion when adapter sync fails', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        ...mockInvoice,
        externalSyncVersion: '3',
      });
      mockAdapter.syncInvoice.mockResolvedValue({ success: false, error: 'QB API error' });

      await service.syncInvoice(1, 'inv_1');

      expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({ externalSyncVersion: '3' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // syncSettlement
  // ---------------------------------------------------------------------------

  describe('syncSettlement', () => {
    const mockSettlement = {
      id: 20,
      settlementId: 'set_1',
      settlementNumber: 'SET-001',
      tenantId: 1,
      periodEnd: new Date('2026-03-15'),
      externalBillId: null,
      externalSyncedAt: null,
      netPayCents: 200000,
      driver: {
        driverId: 'drv_1',
        name: 'John Driver',
        email: 'john@driver.com',
      },
      lineItems: [{ description: 'Linehaul Pay', payAmountCents: 200000 }],
      deductions: [],
    };

    beforeEach(() => {
      mockPrisma.settlement.findFirst.mockResolvedValue(mockSettlement);
      // Driver not yet mapped → service will look up driver from DB
      mockMappingService.getEntityMapping.mockResolvedValue(null);
      mockPrisma.driver.findFirst.mockResolvedValue({
        driverId: 'drv_1',
        name: 'John Driver',
        email: 'john@driver.com',
      });
      mockAdapter.createVendor.mockResolvedValue({
        id: 'qb_vend_1',
        displayName: 'John Driver',
      });
      mockMappingService.createEntityMapping.mockResolvedValue({});
      mockMappingService.getAccountMapping.mockResolvedValue(null);
      mockAdapter.syncBill.mockResolvedValue({
        success: true,
        externalId: 'qb_bill_1',
      });
      mockPrisma.settlement.update.mockResolvedValue({});
    });

    it('should sync settlement and update externalBillId', async () => {
      const result = await service.syncSettlement(1, 'set_1');

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb_bill_1');
      expect(mockPrisma.settlement.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: expect.objectContaining({ externalBillId: 'qb_bill_1' }),
      });
    });

    it('should throw NotFoundException when settlement not found', async () => {
      mockPrisma.settlement.findFirst.mockResolvedValue(null);

      await expect(service.syncSettlement(1, 'set_unknown')).rejects.toThrow(NotFoundException);
    });

    it('should persist QB SyncToken returned by adapter into externalSyncVersion', async () => {
      mockPrisma.settlement.findFirst.mockResolvedValue({
        ...mockSettlement,
        externalBillId: 'qb_bill_1',
        externalSyncVersion: '2',
      });
      mockAdapter.syncBill.mockResolvedValue({
        success: true,
        externalId: 'qb_bill_1',
        syncToken: '3',
      });

      await service.syncSettlement(1, 'set_1');

      expect(mockAdapter.syncBill).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ existingSyncToken: '2' }),
      );
      expect(mockPrisma.settlement.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: expect.objectContaining({ externalSyncVersion: '3' }),
      });
    });

    it('should preserve prior externalSyncVersion when adapter sync fails', async () => {
      mockPrisma.settlement.findFirst.mockResolvedValue({
        ...mockSettlement,
        externalSyncVersion: '2',
      });
      mockAdapter.syncBill.mockResolvedValue({ success: false, error: 'QB API error' });

      await service.syncSettlement(1, 'set_1');

      expect(mockPrisma.settlement.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: expect.objectContaining({ externalSyncVersion: '2' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // syncPayment
  // ---------------------------------------------------------------------------

  describe('syncPayment', () => {
    const mockPayment = {
      id: 30,
      paymentId: 'pay_1',
      tenantId: 1,
      amountCents: 100000,
      paymentDate: new Date('2026-03-10'),
      paymentMethod: 'ACH',
      referenceNumber: 'REF-001',
      externalPaymentId: null,
      externalSyncedAt: null,
      invoice: {
        invoiceNumber: 'INV-001',
        externalInvoiceId: 'qb_inv_1',
        customer: {
          customerId: 'cust_1',
          companyName: 'ABC Logistics',
        },
      },
    };

    beforeEach(() => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockPayment);
      mockMappingService.getEntityMapping.mockResolvedValue({
        externalId: 'qb_cust_1',
        externalName: 'ABC Logistics',
      });
      mockAdapter.syncPayment.mockResolvedValue({
        success: true,
        externalId: 'qb_pay_1',
      });
      mockPrisma.payment.update.mockResolvedValue({});
    });

    it('should sync payment and update externalPaymentId', async () => {
      const result = await service.syncPayment(1, 'pay_1');

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('qb_pay_1');
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 30 },
        data: expect.objectContaining({ externalPaymentId: 'qb_pay_1' }),
      });
    });

    it('should throw when invoice not yet synced to QB', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        ...mockPayment,
        invoice: { ...mockPayment.invoice, externalInvoiceId: null },
      });

      await expect(service.syncPayment(1, 'pay_1')).rejects.toThrow(
        'This invoice has not been synced to QuickBooks yet',
      );
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.syncPayment(1, 'pay_unknown')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // runInitialSync
  // ---------------------------------------------------------------------------

  describe('runInitialSync', () => {
    it('should fetch entities and auto-match all types', async () => {
      const customers = [{ id: 'qb_c1', displayName: 'ABC', email: null }];
      const vendors = [{ id: 'qb_v1', displayName: 'John Driver', email: null }];
      const classes = [{ id: 'qb_cl1', name: 'TRUCK-01' }];

      mockAdapter.fetchCustomers.mockResolvedValue(customers);
      mockAdapter.fetchVendors.mockResolvedValue(vendors);
      mockAdapter.fetchClasses.mockResolvedValue(classes);
      mockMappingService.autoMatchCustomers.mockResolvedValue([]);
      mockMappingService.autoMatchVendors.mockResolvedValue([]);
      mockMappingService.autoMatchClasses.mockResolvedValue([]);

      const result = await service.runInitialSync(1);

      expect(result.success).toBe(true);
      expect(mockMappingService.autoMatchCustomers).toHaveBeenCalledWith(1, 'int_qb_1', customers);
      expect(mockMappingService.autoMatchVendors).toHaveBeenCalledWith(1, 'int_qb_1', vendors);
      expect(mockMappingService.autoMatchClasses).toHaveBeenCalledWith(1, 'int_qb_1', classes);
    });
  });
});
