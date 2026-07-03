import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from '../onboarding.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const mockPrisma = {
  integrationConfig: { findFirst: jest.fn() },
  user: { count: jest.fn() },
  tenant: { findUnique: jest.fn() },
  conversationMessage: { findFirst: jest.fn() },
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
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(overrides.integration ?? null);
      mockPrisma.user.count.mockResolvedValue(overrides.users ?? 1);
      mockPrisma.tenant.findUnique.mockResolvedValue(overrides.tenant ?? null);
      mockPrisma.conversationMessage.findFirst.mockResolvedValue(overrides.ai ?? null);
    }

    it('should return 0% progress when nothing is done', async () => {
      setupDefaults();
      const result = await service.getOnboardingStatus(1);
      expect(result.overallProgress).toBe(0);
      expect(result.completedItems).toBe(0);
      expect(result.totalItems).toBe(4);
    });

    it('should return 100% when all items complete', async () => {
      setupDefaults({
        integration: { vendor: 'QUICKBOOKS' },
        users: 3,
        tenant: { companyName: 'Acme Inc', contactEmail: 'ops@acme.com' },
        ai: { id: 1 },
      });

      const result = await service.getOnboardingStatus(1);
      expect(result.overallProgress).toBe(100);
      expect(result.completedItems).toBe(4);
    });

    it('should mark the setup milestone complete when profile and team are done', async () => {
      setupDefaults({
        tenant: { companyName: 'Acme Inc', contactEmail: 'ops@acme.com' },
        users: 3,
      });

      const result = await service.getOnboardingStatus(1);
      const setup = result.milestones[0];
      expect(setup.status).toBe('complete');
      expect(setup.items.every((i) => i.complete)).toBe(true);
    });

    it('should show correct status text for a connected integration', async () => {
      setupDefaults({ integration: { vendor: 'QUICKBOOKS' } });
      const result = await service.getOnboardingStatus(1);
      const integrationItem = result.milestones[1].items.find((i) => i.id === 'integrations');
      expect(integrationItem.statusText).toBe('QUICKBOOKS connected');
    });
  });
});
