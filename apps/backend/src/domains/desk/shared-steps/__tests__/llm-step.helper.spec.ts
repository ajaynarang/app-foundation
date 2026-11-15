import { z } from 'zod';
import { runStructuredLlmStep } from '../_llm-step.helper';

describe('runStructuredLlmStep', () => {
  function setup(extract: jest.Mock) {
    const stepWriter = {
      open: jest.fn().mockResolvedValue({ id: 'step-1' }),
      succeeded: jest.fn().mockResolvedValue(undefined),
      failed: jest.fn().mockResolvedValue(undefined),
    };
    const input = {
      episodeId: 'ep-1',
      agentId: 3,
      kind: 'DECIDE' as const,
      promptKey: 'desk.decide.v1',
      model: 'standard' as const,
      schema: z.object({ ok: z.boolean() }),
      userMessage: 'facts',
      maxOutputTokens: 2000,
      structuredOutput: { extract } as never,
      prompting: { getPrompt: jest.fn().mockResolvedValue('PROMPT') } as never,
      stepWriter: stepWriter as never,
      prisma: { deskEpisode: { findUniqueOrThrow: jest.fn().mockResolvedValue({ tenantId: 7 }) } } as never,
    };
    return { input, stepWriter };
  }

  it("hands the step's ceiling to the structured call", async () => {
    const extract = jest.fn().mockResolvedValue({ object: { ok: true } });
    const { input } = setup(extract);

    await expect(runStructuredLlmStep(input)).resolves.toEqual({ ok: true });

    expect(extract.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 2000, enforceBudget: true });
  });

  it('a failed call fails the step with its message and rethrows', async () => {
    const extract = jest.fn().mockRejectedValue(new Error('refused'));
    const { input, stepWriter } = setup(extract);

    await expect(runStructuredLlmStep(input)).rejects.toThrow('refused');

    expect(stepWriter.failed).toHaveBeenCalledWith(expect.objectContaining({ errorMessage: 'refused' }));
  });
});
