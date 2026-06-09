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

  // Bug C4: Spec §7.3 — the Desk handles HITL at the episode level
  // (human approve/reject before Act runs). Per-tool-call confirmations
  // would double-prompt, so Desk invocations must bypass this tool.
  describe('_invocationSource bypass (desk vs chat)', () => {
    it('short-circuits to confirmed=true when _invocationSource is "desk" — without suspending', async () => {
      const suspend = jest.fn();
      const context = {
        agent: {
          resumeData: undefined,
          suspend,
        },
      };
      const result = (await confirmActionTool.execute(
        { ...baseArgs, _invocationSource: 'desk' },
        context as any,
      )) as any;
      expect(result).toEqual({
        confirmed: true,
        action: baseArgs.action,
        entityId: baseArgs.entityId,
        bypassed: true,
        reason: 'desk-source-auto-confirm',
      });
      // Critical: desk-origin calls must NOT suspend — nobody is watching
      // to resume them.
      expect(suspend).not.toHaveBeenCalled();
    });

    it('suspends as normal when _invocationSource is "chat"', async () => {
      const suspend = jest.fn().mockResolvedValue(undefined);
      const context = {
        agent: {
          resumeData: undefined,
          suspend,
        },
      };
      await confirmActionTool.execute({ ...baseArgs, _invocationSource: 'chat' }, context as any);
      expect(suspend).toHaveBeenCalledTimes(1);
    });

    it('suspends as normal when _invocationSource is absent (back-compat)', async () => {
      const suspend = jest.fn().mockResolvedValue(undefined);
      const context = {
        agent: {
          resumeData: undefined,
          suspend,
        },
      };
      await confirmActionTool.execute(baseArgs, context as any);
      expect(suspend).toHaveBeenCalledTimes(1);
    });
  });
});
