import { Test } from '@nestjs/testing';
import { CloseOutController } from '../close-out.controller';
import { CloseOutService } from '../close-out.service';
import { BillingReadinessService } from '../billing-readiness.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('CloseOutController', () => {
  let controller: CloseOutController;
  let closeOutService: any;
  let readinessService: any;
  let prisma: any;

  const mockUser = { tenantId: 'tenant-1', userId: 'u-1' };

  beforeEach(async () => {
    closeOutService = {
      getSummary: jest.fn().mockResolvedValue({ total: 10 }),
      list: jest.fn().mockResolvedValue({ loads: [] }),
      approveForBilling: jest.fn().mockResolvedValue({ approved: true }),
      sendBack: jest.fn().mockResolvedValue({ sentBack: true }),
    };
    readinessService = {
      evaluate: jest.fn().mockResolvedValue({ ready: true }),
    };
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, tenantId: 'tenant-1' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 42 }) },
    };

    const module = await Test.createTestingModule({
      controllers: [CloseOutController],
      providers: [
        { provide: CloseOutService, useValue: closeOutService },
        { provide: BillingReadinessService, useValue: readinessService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(CloseOutController);
  });

  it('should get summary', async () => {
    const result = await controller.getSummary(mockUser);
    expect(result).toEqual({ total: 10 });
  });

  it('should list close-out loads', async () => {
    await controller.list(mockUser, 'READY', 'search', undefined, undefined, '10', '5');
    expect(closeOutService.list).toHaveBeenCalledWith(1, {
      billingStatus: 'READY',
      search: 'search',
      dateFrom: undefined,
      dateTo: undefined,
      limit: 10,
      offset: 5,
    });
  });

  it('should get readiness', async () => {
    await controller.getReadiness(mockUser, 'load-1');
    expect(readinessService.evaluate).toHaveBeenCalledWith('load-1', 1);
  });

  it('should approve for billing', async () => {
    await controller.approveForBilling(mockUser, 'load-1', {
      overrideReason: 'test reason override',
    });
    expect(closeOutService.approveForBilling).toHaveBeenCalledWith(1, 'load-1', 42, 'test reason override');
  });

  it('should send back', async () => {
    await controller.sendBack(mockUser, 'load-1', {
      reason: 'missing docs',
    } as any);
    expect(closeOutService.sendBack).toHaveBeenCalledWith(1, 'load-1', 'missing docs', 42);
  });
});
