import { Test, TestingModule } from '@nestjs/testing';
import { DriverTimelineController } from '../driver-timeline.controller';
import { DriverTimelineService } from '../../services/driver-timeline.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DriverTimelineController', () => {
  let controller: DriverTimelineController;
  let timelineService: { getTimeline: jest.Mock };
  let prisma: { tenant: { findUnique: jest.Mock } };

  beforeEach(async () => {
    timelineService = { getTimeline: jest.fn() };
    prisma = { tenant: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverTimelineController],
      providers: [
        { provide: DriverTimelineService, useValue: timelineService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get<DriverTimelineController>(DriverTimelineController);
  });

  it('should return timeline entries for driver', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 1 });
    timelineService.getTimeline.mockResolvedValue({
      entries: [{ id: 1 }],
      cursor: null,
      loadContext: null,
    });

    const result = await controller.getTimeline({ tenantId: 'TNT-001', driverDbId: 5 }, 'LD-001');

    expect(timelineService.getTimeline).toHaveBeenCalledWith(1, 5, 'LD-001', undefined, 50);
    expect(result.entries).toHaveLength(1);
  });

  it('should return empty when no driverDbId', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 1 });

    const result = await controller.getTimeline({
      tenantId: 'TNT-001',
      driverDbId: null,
    });

    expect(result.entries).toEqual([]);
    expect(timelineService.getTimeline).not.toHaveBeenCalled();
  });

  it('should parse and cap limit', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 1 });
    timelineService.getTimeline.mockResolvedValue({
      entries: [],
      cursor: null,
      loadContext: null,
    });

    await controller.getTimeline({ tenantId: 'TNT-001', driverDbId: 5 }, undefined, undefined, '200');

    expect(timelineService.getTimeline).toHaveBeenCalledWith(1, 5, undefined, undefined, 100);
  });
});
