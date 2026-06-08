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

import { NotFoundException } from '@nestjs/common';
import { AgentRegistry } from '../agent.registry';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  const mockAgents: any = {};

  beforeEach(() => {
    const agentDefs = [
      {
        id: 'dispatch',
        displayName: 'Dispatch',
        personas: ['dispatcher', 'admin'],
      },
      { id: 'billing', displayName: 'Billing', personas: ['dispatcher'] },
      { id: 'compliance', displayName: 'Compliance', personas: ['dispatcher'] },
      { id: 'safety', displayName: 'Safety', personas: ['dispatcher'] },
      { id: 'route', displayName: 'Route', personas: ['dispatcher'] },
      { id: 'payroll', displayName: 'Payroll', personas: ['dispatcher'] },
      {
        id: 'maintenance',
        displayName: 'Maintenance',
        personas: ['dispatcher'],
      },
      { id: 'fuel', displayName: 'Fuel', personas: ['driver'] },
      { id: 'driver', displayName: 'Driver', personas: ['driver'] },
      { id: 'customer', displayName: 'Customer', personas: ['customer'] },
      { id: 'support', displayName: 'Support', personas: ['dispatcher'] },
      { id: 'prospect', displayName: 'Prospect', personas: ['prospect'] },
    ];

    for (const def of agentDefs) {
      mockAgents[def.id] = def;
    }

    registry = new AgentRegistry(
      mockAgents.dispatch,
      mockAgents.billing,
      mockAgents.compliance,
      mockAgents.safety,
      mockAgents.route,
      mockAgents.payroll,
      mockAgents.maintenance,
      mockAgents.fuel,
      mockAgents.driver,
      mockAgents.customer,
      mockAgents.support,
      mockAgents.prospect,
    );
  });

  describe('get', () => {
    it('returns agent by id', () => {
      const agent = registry.get('dispatch');
      expect(agent.displayName).toBe('Dispatch');
    });

    it('throws NotFoundException for unknown agent', () => {
      expect(() => registry.get('unknown' as any)).toThrow(NotFoundException);
    });
  });

  describe('getForPersona', () => {
    it('returns agents matching persona', () => {
      const agents = registry.getForPersona('dispatcher');
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.every((a) => a.personas.includes('dispatcher'))).toBe(true);
    });

    it('returns empty for unknown persona', () => {
      const agents = registry.getForPersona('nonexistent' as any);
      expect(agents).toHaveLength(0);
    });
  });

  describe('getAll', () => {
    it('returns all 12 agents', () => {
      expect(registry.getAll()).toHaveLength(12);
    });
  });
});
