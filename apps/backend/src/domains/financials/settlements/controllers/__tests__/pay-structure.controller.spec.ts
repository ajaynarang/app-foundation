import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PayStructureController } from '../pay-structure.controller';
import { PayStructureService } from '../../services/pay-structure.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('PayStructureController', () => {
  let controller: PayStructureController;
  let payStructureService: any;
  let prisma: any;

  const mockUser = {
    tenantId: 'tenant-1',
    driverId: 'drv-1',
    role: 'DISPATCHER',
  };

  beforeEach(async () => {
    payStructureService = {
      getByDriverId: jest.fn().mockResolvedValue({ type: 'PER_MILE', ratePerMileCents: 55 }),
      upsert: jest.fn().mockResolvedValue({ type: 'PER_MILE' }),
    };
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, tenantId: 'tenant-1' }),
      },
    };

    const module = await Test.createTestingModule({
      controllers: [PayStructureController],
      providers: [
        { provide: PayStructureService, useValue: payStructureService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(PayStructureController);
  });

  it('should get own pay structure for driver', async () => {
    const driverUser = { ...mockUser, role: 'DRIVER', driverId: 'drv-1' };
    const result = await controller.getMyPayStructure(driverUser);
    expect(result.type).toBe('PER_MILE');
    expect(payStructureService.getByDriverId).toHaveBeenCalledWith(1, 'drv-1');
  });

  it('should throw when driver has no profile', async () => {
    const noDriver = { tenantId: 'tenant-1', role: 'DRIVER' };
    await expect(controller.getMyPayStructure(noDriver)).rejects.toThrow(ForbiddenException);
  });

  it('should get pay structure by driver ID', async () => {
    await controller.getByDriverId(mockUser, 'drv-2');
    expect(payStructureService.getByDriverId).toHaveBeenCalledWith(1, 'drv-2');
  });

  it('should upsert pay structure', async () => {
    const dto = { type: 'PER_MILE', ratePerMileCents: 60 } as any;
    await controller.upsert(mockUser, 'drv-2', dto);
    expect(payStructureService.upsert).toHaveBeenCalledWith(1, 'drv-2', dto);
  });
});
