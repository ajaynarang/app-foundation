import { Test, TestingModule } from '@nestjs/testing';
import { SamsaraWebhookService } from '../samsara-webhook.service';
import { PrismaService } from '../../database/prisma.service';
import { AlertGenerationService } from '../../../domains/operations/alerts/services/alert-generation.service';
import { Logger } from '@nestjs/common';

describe('SamsaraWebhookService', () => {
  let service: SamsaraWebhookService;

  const mockPrisma = {
    vehicle: {
      findFirst: jest.fn(),
    },
    driver: {
      findFirst: jest.fn(),
    },
  };

  const mockAlertGeneration = {
    generateAlert: jest.fn().mockResolvedValue({ alertId: 'ALT-001' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamsaraWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AlertGenerationService, useValue: mockAlertGeneration },
      ],
    }).compile();

    service = module.get<SamsaraWebhookService>(SamsaraWebhookService);
    jest.clearAllMocks();
  });

  it('should resolve tenant from vehicle Samsara ID and generate HOS alert', async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 1,
      vehicleId: 'V-001',
    });
    mockPrisma.driver.findFirst.mockResolvedValue({
      driverId: 'D-001',
    });

    await service.handleEvent({
      eventId: 'evt-1',
      eventType: 'HosViolation',
      eventTime: '2026-02-18T12:00:00Z',
      orgId: 123,
      data: {
        vehicle: { id: 'samsara-v1', name: 'Truck 1' },
        driver: { id: 'samsara-d1', name: 'John Smith' },
        violation: {
          type: '11_HOUR_DRIVING',
          description: 'Exceeded 11h driving limit',
        },
      },
    });

    expect(mockAlertGeneration.generateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 1,
        alertType: 'HOS_VIOLATION',
        category: 'hos',
        priority: 'CRITICAL',
      }),
    );
  });

  it('should log warning when tenant cannot be resolved', async () => {
    mockPrisma.vehicle.findFirst.mockResolvedValue(null);
    jest.spyOn(Logger.prototype, 'warn');

    await service.handleEvent({
      eventId: 'evt-2',
      eventType: 'EngineFaultOn',
      eventTime: '2026-02-18T12:00:00Z',
      orgId: 999,
      data: {
        vehicle: { id: 'unknown-v', name: 'Unknown' },
        fault: { code: 'P0300', description: 'Engine misfire' },
      },
    });

    expect(mockAlertGeneration.generateAlert).not.toHaveBeenCalled();
  });
});
