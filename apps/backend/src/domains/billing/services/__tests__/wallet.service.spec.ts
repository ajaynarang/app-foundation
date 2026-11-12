import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
import { encodeCursor } from '@appshore/kernel/shared/utils/cursor-pagination';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WalletService } from '../wallet.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PaymentProviderFactory } from '../../adapters/payment-provider.factory';

const mockAdapter = {
  listPaymentMethods: jest.fn().mockResolvedValue([{ id: 'pm_1' }]),
  chargeOneTime: jest.fn().mockResolvedValue('pi_123'),
};

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  billingCustomer: { findUnique: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn((cb: any) => cb(mockPrisma)),
};

const mockProviderFactory = {
  getAdapter: jest.fn().mockReturnValue(mockAdapter),
};

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentProviderFactory, useValue: mockProviderFactory },
      ],
    }).compile();
    service = module.get<WalletService>(WalletService);
  });

  describe('getOrCreateWallet', () => {
    it('should return existing wallet', async () => {
      const wallet = { id: 'w-1', tenantId: 1, balanceCents: 5000 };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);

      const result = await service.getOrCreateWallet(1);
      expect(result).toEqual(wallet);
    });

    it('should create wallet if none exists', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      const newWallet = { id: 'w-1', tenantId: 1, balanceCents: 0 };
      mockPrisma.wallet.create.mockResolvedValue(newWallet);

      const result = await service.getOrCreateWallet(1);
      expect(result).toEqual(newWallet);
      expect(mockPrisma.wallet.create).toHaveBeenCalledWith({
        data: { tenantId: 1 },
      });
    });

    it('reads the row another request created first: two first reads of a wallet race, and the loser must not fail', async () => {
      const winner = { id: 'w-1', tenantId: 1, balanceCents: 0 };
      mockPrisma.wallet.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
      mockPrisma.wallet.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(service.getOrCreateWallet(1)).resolves.toEqual(winner);
    });

    it('still fails when the create fails for any other reason', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.getOrCreateWallet(1)).rejects.toThrow('connection lost');
    });
  });

  describe('getBalance', () => {
    it('should return wallet and recent transactions', async () => {
      const wallet = { id: 'w-1', tenantId: 1, balanceCents: 5000 };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);
      mockPrisma.walletTransaction.findMany.mockResolvedValue([{ id: 't-1' }]);

      const result = await service.getBalance(1);

      expect(result.wallet).toEqual(wallet);
      expect(result.recentTransactions).toHaveLength(1);
    });
  });

  describe('topUp', () => {
    it('should throw if no billing customer', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);

      await expect(service.topUp(1, 10000)).rejects.toThrow(BadRequestException);
    });

    it('should throw if no payment method', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        providerCustomerId: 'cus_1',
      });
      mockAdapter.listPaymentMethods.mockResolvedValue([]);

      await expect(service.topUp(1, 10000)).rejects.toThrow(BadRequestException);
    });

    it('should charge and update wallet balance', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'w-1',
        tenantId: 1,
      });
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        providerCustomerId: 'cus_1',
      });
      mockAdapter.listPaymentMethods.mockResolvedValue([{ id: 'pm_1' }]);
      mockPrisma.wallet.update.mockResolvedValue({ balanceCents: 15000 });
      mockPrisma.walletTransaction.create.mockResolvedValue({});

      await service.topUp(1, 10000);

      expect(mockAdapter.chargeOneTime).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10000 }));
    });
  });

  describe('deductOverage', () => {
    it('should return allowed: false for insufficient balance', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'w-1',
        balanceCents: 100,
      });
      mockPrisma.$executeRaw.mockResolvedValue(0); // no rows affected
      mockPrisma.wallet.findUnique.mockResolvedValue({ balanceCents: 100 });

      const result = await service.deductOverage(1, 'addon-1', 500, 'test');

      expect(result.allowed).toBe(false);
      expect(result.currentBalance).toBe(100);
    });

    it('should deduct and create transaction on success', async () => {
      mockPrisma.wallet.findUnique
        .mockResolvedValueOnce({ id: 'w-1', balanceCents: 5000 }) // getOrCreate
        .mockResolvedValueOnce({ balanceCents: 4500 }); // after deduction
      mockPrisma.$executeRaw.mockResolvedValue(1); // 1 row affected
      mockPrisma.walletTransaction.create.mockResolvedValue({});

      const result = await service.deductOverage(1, 'addon-1', 500, 'usage');

      expect(result.allowed).toBe(true);
      expect(result.currentBalance).toBe(4500);
    });
  });

  describe('addCredit', () => {
    it('should increment balance and create transaction', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      mockPrisma.wallet.update.mockResolvedValue({ balanceCents: 10000 });
      mockPrisma.walletTransaction.create.mockResolvedValue({});

      await service.addCredit(1, 5000, 'Welcome bonus', 'admin-user');

      expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: expect.objectContaining({
          balanceCents: { increment: 5000 },
        }),
      });
    });
  });

  describe('updateAutoReload', () => {
    it('should throw if enabling without threshold/amount', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });

      await expect(service.updateAutoReload(1, { enabled: true })).rejects.toThrow(BadRequestException);
    });

    it('should enable auto-reload with settings', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      mockPrisma.wallet.update.mockResolvedValue({});

      await service.updateAutoReload(1, {
        enabled: true,
        thresholdCents: 1000,
        reloadAmountCents: 5000,
      });

      expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: expect.objectContaining({
          autoReloadEnabled: true,
          autoReloadThresholdCents: 1000,
          autoReloadAmountCents: 5000,
        }),
      });
    });
  });

  describe('getTransactions: a cursor list, newest first', () => {
    it('reads one probe row past the page and hands out a cursor when it came back', async () => {
      const txns = Array.from({ length: 21 }, (_, i) => ({
        id: `t-${i}`,
        createdAt: new Date(Date.UTC(2026, 2, 1) - i * 1000),
      }));
      mockPrisma.walletTransaction.findMany.mockResolvedValue(txns);
      mockPrisma.walletTransaction.count.mockResolvedValue(33);

      const result = await service.getTransactions(1, { limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.total).toBe(33);
      expect(result.nextCursor).toBe(encodeCursor(txns[19].createdAt, 't-19'));
      expect(mockPrisma.walletTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 1 }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21 }),
      );
    });

    describe('walking pages over a fixture', () => {
      // A top-up and the charges it covers land in one millisecond; one row is another tenant's.
      const stamps = tiedTimestamps(8);
      const rows = stamps.map((createdAt, index) => ({
        id: `txn_${(index * 5) % 8}`,
        tenantId: index === 7 ? 2 : 1,
        type: index % 2 === 0 ? 'TOP_UP' : 'OVERAGE_DEDUCTION',
        createdAt,
      }));

      beforeEach(() => Object.assign(mockPrisma.walletTransaction, fixtureModel(rows)));

      it('returns every transaction of the tenant once, ties included', async () => {
        const { pages, items } = await walkCursorList((cursor) => service.getTransactions(1, { limit: 3, cursor }));

        expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
        expect(new Set(items.map((txn) => txn.id)).size).toBe(7);
        const times = items.map((txn) => txn.createdAt.getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
      });

      it('filters by type in the page and the total', async () => {
        const page = await service.getTransactions(1, { type: 'TOP_UP', limit: 2 });
        expect(page.total).toBe(4);
        expect(page.items.every((txn) => txn.type === 'TOP_UP')).toBe(true);
        expect(page.nextCursor).not.toBeNull();
      });

      it('answers 400 on a cursor it did not issue, before any query runs', async () => {
        await expect(service.getTransactions(1, { cursor: 'txn_3' })).rejects.toMatchObject({ status: 400 });
        expect(mockPrisma.walletTransaction.findMany).not.toHaveBeenCalled();
      });
    });
  });
});
