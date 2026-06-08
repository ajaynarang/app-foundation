import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from '../onboarding.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  integrationConfig: { findFirst: jest.fn() },
  driver: { count: jest.fn() },
  vehicle: { count: jest.fn() },
  load: { count: jest.fn() },
  user: { count: jest.fn() },
  fleetOperationsSettings: { findUnique: jest.fn() },
  conversationMessage: { findFirst: jest.fn() },
  shieldAudit: { findFirst: jest.fn() },
};

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnboardingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<OnboardingService>(OnboardingService);
  });

  describe('getOnboardingStatus', () => {
    function setupDefaults(overrides: Record<string, any> = {}) {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(overrides.eld ?? null);
      mockPrisma.driver.count.mockResolvedValue(overrides.drivers ?? 0);
      mockPrisma.vehicle.count.mockResolvedValue(overrides.vehicles ?? 0);
      mockPrisma.load.count.mockResolvedValue(overrides.loads ?? 0);
      mockPrisma.user.count.mockResolvedValue(overrides.users ?? 1);
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue(overrides.prefs ?? null);
      mockPrisma.conversationMessage.findFirst.mockResolvedValue(overrides.ai ?? null);
      mockPrisma.shieldAudit.findFirst.mockResolvedValue(overrides.shield ?? null);
    }

    it('should return 0% progress when nothing is done', async () => {
      setupDefaults();
      const result = await service.getOnboardingStatus(1);
      expect(result.overallProgress).toBe(0);
      expect(result.completedItems).toBe(0);
      expect(result.totalItems).toBe(9);
    });

    it('should return 100% when all items complete', async () => {
      const now = new Date();
      const later = new Date(now.getTime() + 1000);
      setupDefaults({
        eld: { vendor: 'samsara' },
        drivers: 2,
        vehicles: 3,
        loads: 5,
        users: 3,
        prefs: { createdAt: now, updatedAt: later },
        ai: { id: 1 },
        shield: { overallScore: 85, statusLabel: 'Good' },
      });
      // fuel cards
      mockPrisma.fleetOperationsSettings.findUnique
        .mockResolvedValueOnce({ createdAt: now, updatedAt: later }) // prefs check
        .mockResolvedValueOnce({ fuelCards: ['WEX'] }); // fuel check

      const result = await service.getOnboardingStatus(1);
      expect(result.overallProgress).toBe(100);
      expect(result.completedItems).toBe(9);
    });

    it('should mark milestone 1 as complete when ELD, drivers, vehicles done', async () => {
      setupDefaults({
        eld: { vendor: 'samsara' },
        drivers: 1,
        vehicles: 1,
      });

      const result = await service.getOnboardingStatus(1);
      const m1 = result.milestones[0];
      expect(m1.status).toBe('complete');
      expect(m1.items.every((i) => i.complete)).toBe(true);
    });

    it('should show correct status text for connected ELD', async () => {
      setupDefaults({ eld: { vendor: 'samsara' } });
      const result = await service.getOnboardingStatus(1);
      const eldItem = result.milestones[0].items.find((i) => i.id === 'eld');
      expect(eldItem.statusText).toBe('samsara connected');
    });

    it('should include load paths in milestone 2', async () => {
      setupDefaults();
      const result = await service.getOnboardingStatus(1);
      const m2 = result.milestones[1];
      expect(m2.loadPaths).toBeDefined();
      expect(m2.loadPaths.length).toBe(3);
    });
  });
});
