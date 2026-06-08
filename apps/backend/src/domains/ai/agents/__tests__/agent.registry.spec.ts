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
  McpRegistryDiscoveryService: jest.fn(),
  Tool: () => () => {},
}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { NotFoundException } from '@nestjs/common';
import { AgentRegistry } from '../agent.registry';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    const assistant: any = {
      id: 'assistant',
      displayName: 'Assistant',
      personas: ['owner', 'admin', 'member', 'super_admin'],
    };
    registry = new AgentRegistry(assistant);
  });

  describe('get', () => {
    it('returns agent by id', () => {
      const agent = registry.get('assistant');
      expect(agent.displayName).toBe('Assistant');
    });

    it('throws NotFoundException for unknown agent', () => {
      expect(() => registry.get('unknown' as any)).toThrow(NotFoundException);
    });
  });

  describe('getForPersona', () => {
    it('returns agents matching persona', () => {
      const agents = registry.getForPersona('member');
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.every((a) => a.personas.includes('member'))).toBe(true);
    });

    it('returns empty for unknown persona', () => {
      const agents = registry.getForPersona('nonexistent' as any);
      expect(agents).toHaveLength(0);
    });
  });

  describe('getAll', () => {
    it('returns the single registered agent', () => {
      expect(registry.getAll()).toHaveLength(1);
    });
  });
});
