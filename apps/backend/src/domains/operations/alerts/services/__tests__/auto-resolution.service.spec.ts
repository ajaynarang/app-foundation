import { Test, TestingModule } from '@nestjs/testing';
import { AutoResolutionService } from '../auto-resolution.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';

describe('AutoResolutionService', () => {
  let service: AutoResolutionService;

  const mockPrisma = {
    alert: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockDomainEventService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoResolutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DomainEventService, useValue: mockDomainEventService },
      ],
    }).compile();

    service = module.get<AutoResolutionService>(AutoResolutionService);
    jest.clearAllMocks();
  });

  describe('autoResolve', () => {
    it('should auto-resolve an alert with reason', async () => {
      const mockAlert = {
        alertId: 'ALT-001',
        tenantId: 1,
        status: 'AUTO_RESOLVED',
        autoResolved: true,
        autoResolveReason: 'Driver resumed movement',
      };
      mockPrisma.alert.update.mockResolvedValue(mockAlert);

      await service.autoResolve('ALT-001', 1, 'Driver resumed movement');

      expect(mockPrisma.alert.update).toHaveBeenCalledWith({
        where: { alertId: 'ALT-001' },
        data: {
          status: 'AUTO_RESOLVED',
          autoResolved: true,
          autoResolveReason: 'Driver resumed movement',
          resolvedAt: expect.any(Date),
        },
      });
      expect(mockDomainEventService.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ALERT_RESOLVED,
        1,
        expect.objectContaining({
          alertId: 'ALT-001',
          status: 'AUTO_RESOLVED',
          reason: 'Driver resumed movement',
        }),
      );
    });
  });

  describe('unsnoozeExpired', () => {
    it('should unsnooze alerts past their snooze time', async () => {
      const expiredSnooze = {
        alertId: 'ALT-002',
        tenantId: 1,
        status: 'SNOOZED',
        snoozedUntil: new Date(Date.now() - 60000), // expired 1 min ago
      };
      mockPrisma.alert.findMany.mockResolvedValue([expiredSnooze]);
      mockPrisma.alert.update.mockResolvedValue({
        ...expiredSnooze,
        status: 'ACTIVE',
      });

      await service.unsnoozeExpired();

      expect(mockPrisma.alert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { alertId: 'ALT-002' },
          data: expect.objectContaining({
            status: 'ACTIVE',
            snoozedUntil: null,
          }),
        }),
      );
    });
  });
});
