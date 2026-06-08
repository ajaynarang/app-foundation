import { LeadCaptureTool } from '../lead-capture.tool';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('LeadCaptureTool', () => {
  let tool: LeadCaptureTool;
  let mockPrisma: any;

  const planConfigs = [
    {
      plan: 'STARTER',
      displayName: 'Haul',
      tagline: 'For carriers getting started',
      pricePerUnit: 2900,
      unitLabel: 'truck/month',
      fleetLimit: 10,
      isPopular: false,
      ctaLabel: 'Start Free Trial',
      ctaUrl: '/register',
      displayOrder: 1,
      isActive: true,
    },
    {
      plan: 'PROFESSIONAL',
      displayName: 'Fleet',
      tagline: 'For growing fleet operations',
      pricePerUnit: 4900,
      unitLabel: 'truck/month',
      fleetLimit: 25,
      isPopular: true,
      ctaLabel: 'Start Free Trial',
      ctaUrl: '/register',
      displayOrder: 2,
      isActive: true,
    },
    {
      plan: 'ENTERPRISE',
      displayName: 'Freight Force',
      tagline: 'For enterprise-grade carriers',
      pricePerUnit: null,
      unitLabel: 'truck/month',
      fleetLimit: null,
      isPopular: false,
      ctaLabel: 'Contact Sales',
      ctaUrl: 'mailto:sally@appshore.in',
      displayOrder: 3,
      isActive: true,
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      lead: {
        create: jest.fn().mockResolvedValue({
          id: 1,
          leadId: 'lead_abc123',
          name: 'John Smith',
          email: 'john@acme.com',
          company: 'Acme Trucking',
          fleetSize: '50',
          requestType: 'demo',
          status: 'NEW',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      planConfig: {
        findMany: jest.fn().mockResolvedValue(planConfigs),
      },
      planEntitlement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    tool = new LeadCaptureTool(mockPrisma as unknown as PrismaService);
  });

  describe('requestDemo', () => {
    it('should create a lead record with demo request type', async () => {
      const result = await tool.requestDemo({
        name: 'John Smith',
        email: 'john@acme.com',
        company: 'Acme Trucking',
        fleetSize: '50',
      });

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'John Smith',
          email: 'john@acme.com',
          company: 'Acme Trucking',
          fleetSize: '50',
          requestType: 'demo',
          source: 'ai_chat',
        }),
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('John');
    });

    it('should handle missing optional fields', async () => {
      const result = await tool.requestDemo({
        name: 'Jane',
        email: 'jane@test.com',
      });

      expect(mockPrisma.lead.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should detect duplicate email submissions', async () => {
      mockPrisma.lead.findFirst.mockResolvedValue({
        id: 1,
        email: 'john@acme.com',
        requestType: 'demo',
      });

      const result = await tool.requestDemo({
        name: 'John Smith',
        email: 'john@acme.com',
      });

      expect(result.success).toBe(true);
      expect(result.alreadySubmitted).toBe(true);
      expect(mockPrisma.lead.create).not.toHaveBeenCalled();
    });

    it('should handle P2002 unique constraint race condition', async () => {
      const p2002Error = new Error('Unique constraint failed');
      (p2002Error as any).code = 'P2002';
      mockPrisma.lead.create.mockRejectedValue(p2002Error);

      const result = await tool.requestDemo({
        name: 'John Smith',
        email: 'john@acme.com',
      });

      expect(result.success).toBe(true);
      expect(result.alreadySubmitted).toBe(true);
    });

    it('should rethrow non-P2002 errors', async () => {
      mockPrisma.lead.create.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        tool.requestDemo({
          name: 'John Smith',
          email: 'john@acme.com',
        }),
      ).rejects.toThrow('DB connection lost');
    });
  });

  describe('getPricing', () => {
    it('should return Haul tier for small fleets within limit', async () => {
      const result = await tool.getPricing({ fleetSize: 5 });

      expect(result.recommendedTier).toBe('Haul');
      expect(result.tiers).toHaveLength(3);
      expect(result.monthlyEstimate).toBe('$145/month');
    });

    it('should return Fleet tier for fleets exceeding Haul limit', async () => {
      const result = await tool.getPricing({ fleetSize: 15 });

      expect(result.recommendedTier).toBe('Fleet');
      expect(result.monthlyEstimate).toBe('$735/month');
    });

    it('should return Freight Force tier for large fleets', async () => {
      const result = await tool.getPricing({ fleetSize: 200 });

      expect(result.recommendedTier).toBe('Freight Force');
      expect(result.monthlyEstimate).toContain('Custom');
    });
  });
});
