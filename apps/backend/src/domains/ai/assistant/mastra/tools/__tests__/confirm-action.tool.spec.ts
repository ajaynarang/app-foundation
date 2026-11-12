jest.mock('@mastra/core/tools', () => ({
  createTool: jest.fn((config: any) => config),
}));

import { confirmActionTool } from '../confirm-action.tool';

describe('confirmActionTool', () => {
  const baseArgs = {
    action: 'Acknowledge Alert',
    description: 'Acknowledge alert ALT-001',
    entityId: 'alert_1',
    entityType: 'alert',
  };

  it('has correct tool id and schemas', () => {
    expect(confirmActionTool.id).toBe('confirm-action');
    expect(confirmActionTool.inputSchema).toBeDefined();
    expect(confirmActionTool.suspendSchema).toBeDefined();
    expect(confirmActionTool.resumeSchema).toBeDefined();
  });

  it('returns confirmed result when resumeData.confirmed is true', async () => {
    const context = {
      agent: {
        resumeData: { confirmed: true },
        suspend: jest.fn(),
      },
    };

    const result = (await confirmActionTool.execute(baseArgs, context as any)) as any;
    expect(result.confirmed).toBe(true);
    expect(result.action).toBe('Acknowledge Alert');
    expect(result.entityId).toBe('alert_1');
  });

  it('returns denied result when resumeData.confirmed is false', async () => {
    const context = {
      agent: {
        resumeData: { confirmed: false },
        suspend: jest.fn(),
      },
    };

    const result = (await confirmActionTool.execute(baseArgs, context as any)) as any;
    expect(result.confirmed).toBe(false);
  });

  it('calls suspend when no resumeData', async () => {
    const suspend = jest.fn().mockResolvedValue(undefined);
    const context = {
      agent: {
        resumeData: undefined,
        suspend,
      },
    };

    await confirmActionTool.execute(baseArgs, context as any);
    expect(suspend).toHaveBeenCalledWith({
      action: 'Acknowledge Alert',
      description: 'Acknowledge alert ALT-001',
      entityId: 'alert_1',
      entityType: 'alert',
    });
  });

  it('denies by default when suspend is not available', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const context = {
      agent: {
        resumeData: undefined,
        suspend: undefined,
      },
    };

    const result = (await confirmActionTool.execute(baseArgs, context as any)) as any;
    expect(result.confirmed).toBe(false);
    consoleSpy.mockRestore();
  });

  it('denies by default when context is undefined', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const result = (await confirmActionTool.execute(baseArgs, undefined as any)) as any;
    expect(result.confirmed).toBe(false);
    consoleSpy.mockRestore();
  });

  // The Desk branch is gone: a model-supplied `_invocationSource` used to auto-confirm a write.
  describe('no server-side bypass', () => {
    it('a model-supplied _invocationSource no longer auto-confirms: the card is still shown', async () => {
      const suspend = jest.fn().mockResolvedValue(undefined);
      const context = { agent: { resumeData: undefined, suspend } };
      const result = (await confirmActionTool.execute(
        { ...baseArgs, _invocationSource: 'desk' } as any,
        context as any,
      )) as any;
      expect(suspend).toHaveBeenCalledTimes(1);
      expect(result.confirmed).toBe(false);
      expect(result).not.toHaveProperty('bypassed');
    });

    it('the input schema has no _invocationSource field and drops one a model sends', () => {
      const schema = confirmActionTool.inputSchema as any;
      expect(Object.keys(schema.shape)).not.toContain('_invocationSource');
      expect(schema.parse({ ...baseArgs, _invocationSource: 'desk' })).not.toHaveProperty('_invocationSource');
    });
  });
});
