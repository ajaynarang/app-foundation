import { Test } from '@nestjs/testing';
import { RecurringLanesController } from '../recurring-lanes.controller';
import { RecurringLanesService } from '../../services/recurring-lanes.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('RecurringLanesController', () => {
  let controller: RecurringLanesController;
  let service: any;

  const mockUser = { tenantId: 'tenant-1' };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findAll: jest.fn().mockResolvedValue({ lanes: [], total: 0 }),
      getUpcoming: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      expire: jest.fn().mockResolvedValue({ expired: true }),
      softDelete: jest.fn().mockResolvedValue({ deleted: true }),
      activate: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      pause: jest.fn().mockResolvedValue({ status: 'PAUSED' }),
      resume: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      generateLoad: jest.fn().mockResolvedValue({ loadId: 'LD-1' }),
      skip: jest.fn().mockResolvedValue({ skipped: true }),
      preview: jest.fn().mockResolvedValue({ preview: {} }),
    };

    const module = await Test.createTestingModule({
      controllers: [RecurringLanesController],
      providers: [
        { provide: RecurringLanesService, useValue: service },
        {
          provide: PrismaService,
          useValue: {
            tenant: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
          },
        },
      ],
    }).compile();

    controller = module.get(RecurringLanesController);
  });

  it('should create lane', async () => {
    const dto = {
      name: 'DFW-HOU',
      stops: [{ stopId: 's-1', sequenceOrder: 1, actionType: 'pickup' }],
    } as any;
    await controller.create(mockUser, dto);
    expect(service.create).toHaveBeenCalled();
  });

  it('should find all lanes', async () => {
    await controller.findAll(mockUser, 'search', 'ACTIVE', '10', '0');
    expect(service.findAll).toHaveBeenCalledWith(1, {
      search: 'search',
      status: 'ACTIVE',
      limit: 10,
      offset: 0,
    });
  });

  it('should get upcoming', async () => {
    await controller.getUpcoming(mockUser);
    expect(service.getUpcoming).toHaveBeenCalledWith(1);
  });

  it('should find by ID', async () => {
    await controller.findById(mockUser, 1);
    expect(service.findById).toHaveBeenCalledWith(1, 1);
  });

  it('should update', async () => {
    const dto = { name: 'Updated' } as any;
    await controller.update(mockUser, 1, dto);
    expect(service.update).toHaveBeenCalled();
  });

  it('should expire', async () => {
    await controller.expire(mockUser, 1);
    expect(service.expire).toHaveBeenCalledWith(1, 1);
  });

  it('should soft delete', async () => {
    await controller.softDelete(mockUser, 1);
    expect(service.softDelete).toHaveBeenCalledWith(1, 1);
  });

  it('should activate', async () => {
    await controller.activate(mockUser, 1);
    expect(service.activate).toHaveBeenCalledWith(1, 1);
  });

  it('should pause', async () => {
    await controller.pause(mockUser, 1);
    expect(service.pause).toHaveBeenCalledWith(1, 1);
  });

  it('should resume', async () => {
    await controller.resume(mockUser, 1);
    expect(service.resume).toHaveBeenCalledWith(1, 1);
  });

  it('should generate load', async () => {
    await controller.generateLoad(mockUser, 1);
    expect(service.generateLoad).toHaveBeenCalledWith(1, 1);
  });

  it('should skip', async () => {
    await controller.skip(mockUser, 1);
    expect(service.skip).toHaveBeenCalledWith(1, 1);
  });

  it('should preview', async () => {
    await controller.preview(mockUser, 1);
    expect(service.preview).toHaveBeenCalledWith(1, 1);
  });
});
