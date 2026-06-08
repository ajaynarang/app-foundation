// These mocks are required for module resolution — the transitive import chain
// from BillingAgent -> AbstractBaseAgent -> MastraProvider/McpToolService pulls
// in external packages that are not available in the unit-test environment.
// We are NOT testing the mocked framework; we test the BillingAgent's own logic.
jest.mock('@mastra/core', () => ({}));
jest.mock('@mastra/core/agent', () => ({}));
jest.mock('@mastra/core/tools', () => ({ createTool: jest.fn() }));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('ai', () => ({
  jsonSchema: jest.fn(),
  customProvider: jest.fn(),
  createGateway: jest.fn(),
}));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn() }));
jest.mock('zod-to-json-schema', () => ({ zodToJsonSchema: jest.fn() }));
jest.mock('@rekog/mcp-nest', () => ({
  McpRegistryService: jest.fn(),
  Tool: () => () => {},
}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { BillingAgent } from '../billing.agent';

describe('BillingAgent', () => {
  let agent: BillingAgent;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      load: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    agent = new BillingAgent(
      { getSkills: jest.fn(), getSkill: jest.fn() } as any,
      { getToolsetsForPersona: jest.fn() } as any,
      { getMastra: jest.fn() } as any,
      { record: jest.fn() } as any,
      mockPrisma,
    );
  });

  // ── Definition properties ──

  describe('definition', () => {
    it('has id "billing"', () => {
      expect(agent.id).toBe('billing');
      expect(agent.definition.id).toBe('billing');
    });

    it('has displayName "Billing"', () => {
      expect(agent.displayName).toBe('Billing');
      expect(agent.definition.displayName).toBe('Billing');
    });

    it('has mastraAgentId "sally-billing"', () => {
      expect(agent.mastraAgentId).toBe('sally-billing');
      expect(agent.definition.mastraAgentId).toBe('sally-billing');
    });

    it('uses the "standard" model alias', () => {
      expect(agent.definition.modelAlias).toBe('standard');
    });

    it('has maxToolSteps of 10', () => {
      expect(agent.definition.maxToolSteps).toBe(10);
    });
  });

  // ── Domain skills ──

  describe('domain skills', () => {
    it('includes billing-expertise and customer-payment-patterns', () => {
      expect(agent.domainSkills).toEqual(['billing-expertise', 'customer-payment-patterns']);
    });

    it('has exactly 2 domain skills', () => {
      expect(agent.domainSkills).toHaveLength(2);
    });
  });

  // ── Task skills ──

  describe('task skills', () => {
    it('includes all 7 expected billing task skills', () => {
      expect(agent.taskSkills).toEqual([
        'close-out-load',
        'generate-batch-invoices',
        'chase-aging-ar',
        'handle-billing-dispute',
        'submit-invoice-to-factor',
        'detect-detention-opportunity',
        'evaluate-rate-con',
      ]);
    });

    it('has exactly 7 task skills', () => {
      expect(agent.taskSkills).toHaveLength(7);
    });

    it('includes close-out-load for end-of-load billing', () => {
      expect(agent.taskSkills).toContain('close-out-load');
    });

    it('includes generate-batch-invoices for bulk invoicing', () => {
      expect(agent.taskSkills).toContain('generate-batch-invoices');
    });

    it('includes chase-aging-ar for collections', () => {
      expect(agent.taskSkills).toContain('chase-aging-ar');
    });

    it('includes factor-invoice for factoring', () => {
      expect(agent.taskSkills).toContain('submit-invoice-to-factor');
    });

    it('includes detect-detention-opportunity for revenue recovery', () => {
      expect(agent.taskSkills).toContain('detect-detention-opportunity');
    });

    it('includes evaluate-rate-con for rate confirmation review', () => {
      expect(agent.taskSkills).toContain('evaluate-rate-con');
    });
  });

  // ── Personas ──

  describe('personas', () => {
    it('is accessible to dispatcher, admin, owner, and super_admin', () => {
      expect(agent.personas).toEqual(['dispatcher', 'admin', 'owner', 'super_admin']);
    });

    it('does NOT include driver or customer personas', () => {
      expect(agent.personas).not.toContain('driver');
      expect(agent.personas).not.toContain('customer');
    });

    it('has exactly 4 personas', () => {
      expect(agent.personas).toHaveLength(4);
    });
  });

  // ── getStatus ──

  describe('getStatus', () => {
    it('returns "monitoring" state when invoices are ready to bill', async () => {
      mockPrisma.load.count.mockResolvedValue(3);

      const status = await agent.getStatus(1);

      expect(status.state).toBe('monitoring');
      expect(status.summary).toBe('3 invoices ready');
    });

    it('returns "idle" state when no invoices are ready', async () => {
      mockPrisma.load.count.mockResolvedValue(0);

      const status = await agent.getStatus(1);

      expect(status.state).toBe('idle');
      expect(status.summary).toBe('All caught up');
    });

    it('queries loads with billingStatus "ready_to_bill" for the given tenantId', async () => {
      mockPrisma.load.count.mockResolvedValue(0);

      await agent.getStatus(42);

      expect(mockPrisma.load.count).toHaveBeenCalledWith({
        where: { tenantId: 42, billingStatus: 'APPROVED' },
      });
    });

    it('passes the tenantId argument to Prisma query', async () => {
      mockPrisma.load.count.mockResolvedValue(0);

      await agent.getStatus(99);

      expect(mockPrisma.load.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 99 }),
        }),
      );
    });

    it('returns monitoring with correct count in summary for large numbers', async () => {
      mockPrisma.load.count.mockResolvedValue(150);

      const status = await agent.getStatus(1);

      expect(status.state).toBe('monitoring');
      expect(status.summary).toBe('150 invoices ready');
    });

    it('returns monitoring (not idle) when exactly 1 invoice is ready', async () => {
      mockPrisma.load.count.mockResolvedValue(1);

      const status = await agent.getStatus(1);

      expect(status.state).toBe('monitoring');
      expect(status.summary).toBe('1 invoices ready');
    });

    it('propagates Prisma errors', async () => {
      mockPrisma.load.count.mockRejectedValue(new Error('Connection refused'));

      await expect(agent.getStatus(1)).rejects.toThrow('Connection refused');
    });
  });
});
