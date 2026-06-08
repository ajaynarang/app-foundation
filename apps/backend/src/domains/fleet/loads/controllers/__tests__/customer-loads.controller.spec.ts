import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CustomerLoadsController } from '../customer-loads.controller';
import { LoadsService } from '../../services/loads.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('CustomerLoadsController', () => {
  let controller: CustomerLoadsController;
  let loadsService: any;

  const customerUser = {
    tenantId: 'tenant-1',
    tenantDbId: 1,
    customerId: 'cust-1',
    customerDbId: 10,
    customerName: 'Acme',
  };

  beforeEach(async () => {
    loadsService = {
      findByCustomerId: jest.fn().mockResolvedValue([]),
      findOneForCustomer: jest.fn().mockResolvedValue({ loadId: 'LD-1' }),
      createFromCustomerRequest: jest.fn().mockResolvedValue({ loadId: 'LD-2' }),
    };

    const module = await Test.createTestingModule({
      controllers: [CustomerLoadsController],
      providers: [
        { provide: LoadsService, useValue: loadsService },
        {
          provide: PrismaService,
          useValue: {
            tenant: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
          },
        },
      ],
    }).compile();

    controller = module.get(CustomerLoadsController);
  });

  it('should get customer loads', async () => {
    await controller.getMyLoads(customerUser);
    expect(loadsService.findByCustomerId).toHaveBeenCalledWith(10, 1);
  });

  it('should throw when no customer linked', async () => {
    await expect(controller.getMyLoads({ ...customerUser, customerId: undefined })).rejects.toThrow(ForbiddenException);
  });

  it('should get single load for customer', async () => {
    await controller.getLoad(customerUser, 'LD-1');
    expect(loadsService.findOneForCustomer).toHaveBeenCalledWith('LD-1', 10);
  });

  it('should request a new load', async () => {
    await controller.requestLoad(customerUser, { origin: 'Dallas' });
    expect(loadsService.createFromCustomerRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 1, customer_id: 10 }),
    );
  });
});
