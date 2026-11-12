jest.mock('ai', () => ({
  generateText: jest.fn(),
  Output: {
    object: jest.fn().mockReturnValue('mock-output'),
  },
}));
jest.mock('../ai-provider', () => ({
  ai: jest.fn().mockReturnValue('mock-model'),
  LANGUAGE_PROVIDER_LABEL: 'anthropic',
}));

import { StructuredOutputService } from '../structured-output.service';
import { generateText } from 'ai';
import { z } from 'zod';
import type { AiCallContext } from '@app/shared-types';

describe('StructuredOutputService', () => {
  let service: StructuredOutputService;
  let aiTelemetry: { record: jest.Mock; assertBudget: jest.Mock; assertZeroRetention: jest.Mock };

  beforeEach(() => {
    aiTelemetry = {
      record: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      assertBudget: jest.fn().mockResolvedValue({ state: 'ok' }),
      assertZeroRetention: jest.fn().mockResolvedValue(undefined),
    };
    service = new StructuredOutputService(aiTelemetry as any);
    (generateText as jest.Mock).mockReset();
  });

  describe('extract — output ceiling', () => {
    it("hands the caller's ceiling to every call (the provider default can be the model's whole output window)", async () => {
      (generateText as jest.Mock).mockResolvedValue({ output: { name: 'test' } });

      await service.extract({
        messages: [{ role: 'user', content: 'test' }],
        schema: z.object({ name: z.string() }),
        modelAlias: 'fast',
        systemPrompt: 'Extract data',
        timeoutMs: 30000,
        maxOutputTokens: 1500,
      });

      expect((generateText as jest.Mock).mock.calls[0][0].maxOutputTokens).toBe(1500);
    });
  });

  describe('extract — happy path', () => {
    it('uses generateText from ai SDK', async () => {
      (generateText as jest.Mock).mockResolvedValue({ output: { name: 'test' } });

      const result = await service.extract({
        messages: [{ role: 'user', content: 'test' }],
        schema: z.object({ name: z.string() }),
        modelAlias: 'fast',
        systemPrompt: 'Extract data',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
      });

      expect(result.object).toEqual({ name: 'test' });
      expect(generateText).toHaveBeenCalled();
    });

    it('uses provided model when available', async () => {
      (generateText as jest.Mock).mockResolvedValue({ output: { name: 'test' } });
      const customModel = { modelId: 'custom-model' } as any;

      await service.extract({
        messages: [],
        schema: z.object({ name: z.string() }),
        modelAlias: 'fast',
        systemPrompt: 'Extract',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        model: customModel,
      });

      const call = (generateText as jest.Mock).mock.calls[0][0];
      expect(call.model).toBe(customModel);
    });
  });

  describe('extract — telemetry', () => {
    const baseContext: AiCallContext = {
      tenantId: 7,
      surface: 'KB_INGEST',
      agentId: 'ratecon-parser',
      linkRefType: 'document',
      linkRefId: 'doc-abc',
    };

    it('skips telemetry when no aiContext is supplied', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { name: 'x' },
        usage: { promptTokens: 100, completionTokens: 50 },
      });

      const result = await service.extract({
        messages: [],
        schema: z.object({ name: z.string() }),
        modelAlias: 'standard',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
      });

      expect(aiTelemetry.record).not.toHaveBeenCalled();
      expect(result.aiInvocationId).toBeUndefined();
    });

    it('records a successful invocation with token counts when aiContext is supplied', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { name: 'x' },
        usage: { promptTokens: 200, completionTokens: 100, cachedPromptTokens: 50 },
      });

      const result = await service.extract({
        messages: [],
        schema: z.object({ name: z.string() }),
        modelAlias: 'standard',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: baseContext,
      });

      expect(aiTelemetry.record).toHaveBeenCalledTimes(1);
      const [usage, ctx] = aiTelemetry.record.mock.calls[0];
      expect(usage).toMatchObject({
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        cachedTokens: 50,
        status: 'OK',
      });
      expect(usage.latencyMs).toEqual(expect.any(Number));
      expect(ctx).toBe(baseContext);
      expect(result.aiInvocationId).toBe('inv-1');
    });

    it('maps every model alias to the snapshot model string', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { ok: true },
        usage: { promptTokens: 1, completionTokens: 1 },
      });

      for (const [alias, expected] of [
        ['fast', 'claude-haiku-5-5'],
        ['standard', 'claude-sonnet-5-5'],
        ['powerful', 'claude-opus-5-5'],
      ] as const) {
        aiTelemetry.record.mockClear();
        await service.extract({
          messages: [],
          schema: z.object({ ok: z.boolean() }),
          modelAlias: alias,
          systemPrompt: 'p',
          timeoutMs: 30000,
          maxOutputTokens: 1024,
          aiContext: baseContext,
        });
        expect(aiTelemetry.record.mock.calls[0][0].model).toBe(expected);
      }
    });

    it('records the model that actually answered when a refusal fell back one alias up', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { name: 'x' },
        usage: { inputTokens: 10, outputTokens: 5 },
        response: { modelId: 'claude-sonnet-5-5' },
      });

      await service.extract({
        messages: [],
        schema: z.object({ name: z.string() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: baseContext,
      });

      expect(aiTelemetry.record.mock.calls[0][0].model).toBe('claude-sonnet-5-5');
    });

    it('keeps the alias model id when the provider reports an id with no pricing row (e.g. dated)', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { name: 'x' },
        usage: { inputTokens: 10, outputTokens: 5 },
        response: { modelId: 'claude-haiku-5-5-20261001' },
      });

      await service.extract({
        messages: [],
        schema: z.object({ name: z.string() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: baseContext,
      });

      expect(aiTelemetry.record.mock.calls[0][0].model).toBe('claude-haiku-5-5');
    });

    it('records a failed invocation with status=ERROR when generateText throws', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('upstream 500'));

      await expect(
        service.extract({
          messages: [],
          schema: z.object({ name: z.string() }),
          modelAlias: 'fast',
          systemPrompt: 'p',
          timeoutMs: 30000,
          maxOutputTokens: 1024,
          aiContext: baseContext,
        }),
      ).rejects.toThrow('upstream 500');

      expect(aiTelemetry.record).toHaveBeenCalledTimes(1);
      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.status).toBe('ERROR');
      expect(usage.errorCode).toBe('Error');
      // No tokens — call never returned a usage block
      expect(usage.promptTokens).toBe(0);
      expect(usage.completionTokens).toBe(0);
    });

    it('records status=TIMEOUT when the abort signal fires', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      (generateText as jest.Mock).mockRejectedValue(abortErr);

      await expect(
        service.extract({
          messages: [],
          schema: z.object({ name: z.string() }),
          modelAlias: 'fast',
          systemPrompt: 'p',
          timeoutMs: 30000,
          maxOutputTokens: 1024,
          aiContext: baseContext,
        }),
      ).rejects.toThrow('aborted');

      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.status).toBe('TIMEOUT');
      expect(usage.errorCode).toBe('AbortError');
    });

    it('stamps the recorded invocation id on the thrown error so callers can join failed steps to the ledger', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('boom'));

      try {
        await service.extract({
          messages: [],
          schema: z.object({ name: z.string() }),
          modelAlias: 'fast',
          systemPrompt: 'p',
          timeoutMs: 30000,
          maxOutputTokens: 1024,
          aiContext: baseContext,
        });
        throw new Error('unreachable');
      } catch (err) {
        expect((err as Record<string, unknown>).aiInvocationId).toBe('inv-1');
      }
    });

    it('does not break the AI call when telemetry recording throws', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { name: 'x' },
        usage: { promptTokens: 100, completionTokens: 50 },
      });
      aiTelemetry.record.mockRejectedValue(new Error('db down'));

      const result = await service.extract({
        messages: [],
        schema: z.object({ name: z.string() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: baseContext,
      });

      expect(result.object).toEqual({ name: 'x' });
      expect(result.aiInvocationId).toBeUndefined();
    });
  });

  describe('extract — usage extraction shapes', () => {
    const ctx: AiCallContext = { tenantId: 1, surface: 'CHAT' };

    it('reads inputTokens/outputTokens variant', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { x: 1 },
        usage: { inputTokens: 42, outputTokens: 7 },
      });

      await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: ctx,
      });

      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.promptTokens).toBe(42);
      expect(usage.completionTokens).toBe(7);
    });

    it('reads cacheReadInputTokens variant for cached tokens', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { x: 1 },
        usage: { promptTokens: 100, completionTokens: 10, cacheReadInputTokens: 30 },
      });

      await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: ctx,
      });

      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.cachedTokens).toBe(30);
    });

    it('falls back to totalUsage when usage is absent', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { x: 1 },
        totalUsage: { promptTokens: 5, completionTokens: 3 },
      });

      await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: ctx,
      });

      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.promptTokens).toBe(5);
      expect(usage.completionTokens).toBe(3);
    });

    it('records zero tokens when no usage block is present at all', async () => {
      (generateText as jest.Mock).mockResolvedValue({ output: { x: 1 } });

      await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: ctx,
      });

      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.promptTokens).toBe(0);
      expect(usage.completionTokens).toBe(0);
    });
  });

  describe('extract — budget enforcement', () => {
    const ctx: AiCallContext = { tenantId: 7, surface: 'KB_INGEST' };

    it('does not check budget when enforceBudget is false/absent', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { x: 1 },
        usage: { promptTokens: 1, completionTokens: 1 },
      });
      await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: ctx,
      });
      expect(aiTelemetry.assertBudget).not.toHaveBeenCalled();
    });

    it('checks budget before the model call when enforceBudget is true', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { x: 1 },
        usage: { promptTokens: 1, completionTokens: 1 },
      });
      await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        enforceBudget: true,
        aiContext: ctx,
      });
      expect(aiTelemetry.assertBudget).toHaveBeenCalledWith(7);
    });

    it('does not call the model or record a row when budget is exceeded', async () => {
      aiTelemetry.assertBudget.mockRejectedValue(new Error('AiBudgetExceededError'));
      (generateText as jest.Mock).mockResolvedValue({ output: { x: 1 } });

      await expect(
        service.extract({
          messages: [],
          schema: z.object({ x: z.number() }),
          modelAlias: 'fast',
          systemPrompt: 'p',
          timeoutMs: 30000,
          maxOutputTokens: 1024,
          enforceBudget: true,
          aiContext: ctx,
        }),
      ).rejects.toThrow('AiBudgetExceededError');

      // Blocked before spending a model call — no generateText, no ledger row.
      expect(generateText).not.toHaveBeenCalled();
      expect(aiTelemetry.record).not.toHaveBeenCalled();
    });

    it('skips the budget check entirely when no aiContext (telemetry-off path)', async () => {
      (generateText as jest.Mock).mockResolvedValue({ output: { x: 1 } });
      await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        enforceBudget: true, // true but no context → nothing to scope the check to
      });
      expect(aiTelemetry.assertBudget).not.toHaveBeenCalled();
    });
  });
});
