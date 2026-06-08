import { Test, TestingModule } from '@nestjs/testing';
import { AlertPriority } from '@prisma/client';

import { AlertTriggersService } from '../alert-triggers.service';
import { AlertGenerationService } from '../alert-generation.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('AlertTriggersService', () => {
  let service: AlertTriggersService;

  const mockAlertGen = {
    generateAlert: jest.fn().mockResolvedValue({ alertId: 'ALT-001' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertTriggersService,
        {
          provide: PrismaService,
          useValue: {
            load: { findFirst: jest.fn().mockResolvedValue(null) },
            alertConfiguration: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          },
        },
        { provide: AlertGenerationService, useValue: mockAlertGen },
      ],
    }).compile();

    service = module.get<AlertTriggersService>(AlertTriggersService);
    jest.clearAllMocks();
  });

  it('should trigger a known alert type with correct title and message', async () => {
    const result = await service.trigger('HOS_VIOLATION', 1, 'driver-1', {
      driverName: 'John Doe',
      hoursType: 'driving',
      currentHours: '11.5',
      limitHours: '11',
    });

    expect(result).toBeTruthy();
    expect(mockAlertGen.generateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: AlertPriority.CRITICAL,
        title: expect.stringContaining('John Doe'),
      }),
    );
  });

  it('should return null for unknown alert type', async () => {
    const result = await service.trigger('UNKNOWN_TYPE', 1, 'driver-1');
    expect(result).toBeNull();
    expect(mockAlertGen.generateAlert).not.toHaveBeenCalled();
  });
});
