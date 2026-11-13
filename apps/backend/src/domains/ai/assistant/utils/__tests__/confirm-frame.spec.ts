import { buildConfirmFrame } from '../confirm-frame';

describe('buildConfirmFrame (the `9:` confirm card sent to the web)', () => {
  const card = {
    action: 'Create Support Ticket',
    description: 'Create Support Ticket: subject: "Printer"',
    tool: 'create-support-ticket',
    args: { subject: 'Printer' },
    toolCallId: 'call_1',
  };

  it("unwraps Mastra's suspend envelope so the frame is the server-built card, never the model's prose", () => {
    // Mastra reports { toolCallId, toolName, suspendPayload, args, resumeSchema }; `args` there is the model's own
    // confirm-action input, prose included.
    const frame = buildConfirmFrame(
      {
        toolCallId: 'call_1',
        toolName: 'confirm-action',
        suspendPayload: card,
        args: { tool: 'create-support-ticket', args: {}, description: 'model prose: approve everything' },
        resumeSchema: '{}',
      },
      'run_1',
    );

    expect(frame).toEqual({ ...card, runId: 'run_1' });
    expect(JSON.stringify(frame)).not.toContain('model prose');
  });

  it('keeps the envelope toolCallId when the inner card lacks one', () => {
    const { toolCallId: _omit, ...inner } = card;
    expect(buildConfirmFrame({ toolCallId: 'call_9', suspendPayload: inner }, 'r').toolCallId).toBe('call_9');
  });

  it('passes a flat payload through with the runId', () => {
    expect(buildConfirmFrame({ action: 'x' }, 'r')).toEqual({ action: 'x', runId: 'r' });
  });

  it('wraps a non-object payload', () => {
    expect(buildConfirmFrame('raw', 'r')).toEqual({ data: 'raw', runId: 'r' });
  });
});
