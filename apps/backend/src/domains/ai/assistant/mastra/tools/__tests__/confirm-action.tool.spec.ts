jest.mock('@mastra/core/tools', () => ({
  createTool: jest.fn((config: any) => config),
}));

import { createConfirmActionTool, describeIntent, type ConfirmCard } from '../confirm-action.tool';

describe('confirm-action (the chat confirmation card, bound to the exact write)', () => {
  const card: ConfirmCard = {
    action: 'Create Support Ticket',
    description: 'Create Support Ticket: subject: "Printer"',
    tool: 'create-support-ticket',
    args: { subject: 'Printer' },
    toolCallId: 'call_1',
  };
  const proposal = { tool: 'create-support-ticket', args: { subject: 'Printer' }, description: 'model prose' };

  it('records the named write and suspends with the card the server built, not the model prose', async () => {
    const recorder = jest.fn().mockResolvedValue({ ok: true, card });
    const tool = createConfirmActionTool(recorder) as any;
    const suspend = jest.fn().mockResolvedValue(undefined);

    await tool.execute(proposal, { agent: { suspend, toolCallId: 'call_1' } });

    expect(recorder).toHaveBeenCalledWith({
      tool: 'create-support-ticket',
      args: { subject: 'Printer' },
      toolCallId: 'call_1',
    });
    expect(suspend).toHaveBeenCalledWith(card);
    expect(JSON.stringify(suspend.mock.calls[0][0])).not.toContain('model prose');
  });

  it('does not suspend when the server refuses the proposal, and tells the model why', async () => {
    const recorder = jest.fn().mockResolvedValue({ ok: false, error: '"x" is not a change you can ask to confirm' });
    const tool = createConfirmActionTool(recorder) as any;
    const suspend = jest.fn();

    const result = await tool.execute(proposal, { agent: { suspend, toolCallId: 'call_1' } });

    expect(suspend).not.toHaveBeenCalled();
    expect(result).toEqual({ confirmed: false, tool: 'create-support-ticket', reason: expect.stringContaining('"x"') });
  });

  it('reports the decision on resume without recording anything again', async () => {
    const recorder = jest.fn();
    const tool = createConfirmActionTool(recorder) as any;

    const yes = await tool.execute(proposal, { agent: { resumeData: { confirmed: true }, toolCallId: 'call_1' } });
    const no = await tool.execute(proposal, { agent: { resumeData: { confirmed: false }, toolCallId: 'call_1' } });

    expect(yes.confirmed).toBe(true);
    expect(no.confirmed).toBe(false);
    expect(recorder).not.toHaveBeenCalled();
  });

  it('denies, and records nothing, when it cannot suspend or has no call id', async () => {
    const recorder = jest.fn();
    const tool = createConfirmActionTool(recorder) as any;

    expect((await tool.execute(proposal, { agent: { toolCallId: 'call_1' } })).confirmed).toBe(false);
    expect((await tool.execute(proposal, { agent: { suspend: jest.fn() } })).confirmed).toBe(false);
    expect((await tool.execute(proposal, undefined)).confirmed).toBe(false);
    expect(recorder).not.toHaveBeenCalled();
  });

  // The Desk branch is gone: a model-supplied `_invocationSource` used to auto-confirm a write.
  describe('no server-side bypass', () => {
    it('a model-supplied _invocationSource no longer auto-confirms: the card is still raised', async () => {
      const recorder = jest.fn().mockResolvedValue({ ok: true, card });
      const tool = createConfirmActionTool(recorder) as any;
      const suspend = jest.fn().mockResolvedValue(undefined);

      const result = await tool.execute(
        { ...proposal, _invocationSource: 'desk' },
        { agent: { suspend, toolCallId: 'call_1' } },
      );

      expect(suspend).toHaveBeenCalledTimes(1);
      expect(result.confirmed).toBe(false);
    });

    it('the input schema has no _invocationSource field and drops one a model sends', () => {
      const schema = (createConfirmActionTool(jest.fn()) as any).inputSchema;
      expect(Object.keys(schema.shape)).not.toContain('_invocationSource');
      expect(schema.parse({ ...proposal, _invocationSource: 'desk' })).not.toHaveProperty('_invocationSource');
    });
  });
});

describe('describeIntent (card copy from the recorded tool and arguments)', () => {
  it('names the tool and lists the arguments', () => {
    expect(describeIntent('create-support-ticket', { subject: 'Printer', priorityLevel: 'HIGH', count: 2 })).toEqual({
      action: 'Create Support Ticket',
      description: 'Create Support Ticket: subject: "Printer", priority level: "HIGH", count: 2',
    });
  });

  it('leaves out empty values and caps a long description', () => {
    expect(describeIntent('do-it', { a: '', b: null }).description).toBe('Do It');
    expect(describeIntent('do-it', { note: 'x'.repeat(1000) }).description.length).toBe(400);
  });
});
