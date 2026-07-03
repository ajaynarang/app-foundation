import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentMethodService } from '../payment-method.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PaymentProviderFactory } from '../../adapters/payment-provider.factory';

const mockAdapter = {
  createSetupSession: jest.fn().mockResolvedValue('https://setup.stripe.com'),
  setDefaultPaymentMethod: jest.fn().mockResolvedValue(undefined),
  deletePaymentMethod: jest.fn().mockResolvedValue(undefined),
  listPaymentMethods: jest.fn().mockResolvedValue([]),
};

const mockPrisma = {
  billingCustomer: { findUnique: jest.fn() },
  paymentMethod: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  billingSubscription: { findFirst: jest.fn() },
  $transaction: jest.fn((args: any) => {
    if (Array.isArray(args)) return Promise.all(args);
    return args(mockPrisma);
  }),
};

const mockProviderFactory = {
  getAdapter: jest.fn().mockReturnValue(mockAdapter),
};

describe('PaymentMethodService', () => {
  let service: PaymentMethodService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentProviderFactory, useValue: mockProviderFactory },
      ],
    }).compile();
    service = module.get<PaymentMethodService>(PaymentMethodService);
  });

  describe('addPaymentMethod', () => {
    it('should throw if no billing customer', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);
      await expect(service.addPaymentMethod(1, 'url')).rejects.toThrow(BadRequestException);
    });

    it('should return setup URL', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        providerCustomerId: 'cus_1',
      });
      const result = await service.addPaymentMethod(1, 'https://return.url');
      expect(result.setupUrl).toContain('setup.stripe.com');
    });
  });

  describe('setDefault', () => {
    it('should throw if payment method not found', async () => {
      mockPrisma.paymentMethod.findFirst.mockResolvedValue(null);
      await expect(service.setDefault(1, 'pm-1')).rejects.toThrow(NotFoundException);
    });

    it('should update provider and local records', async () => {
      mockPrisma.paymentMethod.findFirst.mockResolvedValue({
        id: 'pm-1',
        providerPaymentMethodId: 'pm_stripe_1',
      });
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        providerCustomerId: 'cus_1',
      });
      mockPrisma.paymentMethod.updateMany.mockResolvedValue({});
      mockPrisma.paymentMethod.update.mockResolvedValue({});

      await service.setDefault(1, 'pm-1');

      expect(mockAdapter.setDefaultPaymentMethod).toHaveBeenCalledWith('cus_1', 'pm_stripe_1');
    });
  });

  describe('removePaymentMethod', () => {
    it('should throw if method not found', async () => {
      mockPrisma.paymentMethod.findFirst.mockResolvedValue(null);
      await expect(service.removePaymentMethod(1, 'pm-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw if removing only default method with active subscription', async () => {
      mockPrisma.paymentMethod.findFirst.mockResolvedValue({
        id: 'pm-1',
        isDefault: true,
        providerPaymentMethodId: 'pm_stripe_1',
      });
      mockPrisma.billingSubscription.findFirst.mockResolvedValue({
        status: 'ACTIVE',
      });
      mockPrisma.paymentMethod.count.mockResolvedValue(1);

      await expect(service.removePaymentMethod(1, 'pm-1')).rejects.toThrow(BadRequestException);
    });

    it('should allow removing non-default method', async () => {
      mockPrisma.paymentMethod.findFirst.mockResolvedValue({
        id: 'pm-1',
        isDefault: false,
        providerPaymentMethodId: 'pm_stripe_1',
      });
      mockPrisma.paymentMethod.delete.mockResolvedValue({});

      await service.removePaymentMethod(1, 'pm-1');

      expect(mockAdapter.deletePaymentMethod).toHaveBeenCalledWith('pm_stripe_1');
    });
  });
});
