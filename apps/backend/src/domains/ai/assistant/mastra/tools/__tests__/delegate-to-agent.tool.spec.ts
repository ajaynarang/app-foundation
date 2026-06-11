import { delegateToAgentTool } from '../delegate-to-agent.tool';

describe('delegateToAgentTool', () => {
  it('should have correct tool id', () => {
    expect(delegateToAgentTool.id).toBe('delegate-to-agent');
  });

  it('should have a description', () => {
    expect(delegateToAgentTool.description).toContain('specialist agent');
  });

  it('should have input schema requiring agentId, action, and params', () => {
    expect(delegateToAgentTool.inputSchema).toBeDefined();
    const schema = delegateToAgentTool.inputSchema;
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should validate valid input', () => {
    const schema = delegateToAgentTool.inputSchema;
    const result = schema.safeParse({
      agentId: 'assistant',
      action: 'check load',
      params: { loadId: '123' },
    });
    expect(result.success).toBe(true);
  });
});
