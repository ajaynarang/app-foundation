jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: jest.fn(),
  Output: {
    object: jest.fn().mockReturnValue('mock-output'),
  },
}));

import { StructuredOutputService } from '../structured-output.service';
import { generateText } from 'ai';
import { z } from 'zod';
import type { AiCallContext } from '@app/shared-types';
import { makeResolver } from '../../../routing/__tests__/resolver-fixtures';
import { AiNotConfigured } from '../../../routing/ai-not-configured.error';
import { ZeroRetentionUnavailable } from '../../redaction/zero-retention-unavailable.error';
import { AiProviderCreditRefused } from '../../telemetry/ai-provider-credit-refused.error';

const OPENROUTER = { openRouterApiKey: 'sk-or-test' };
const CTX: AiCallContext = { tenantId: 7, surface: 'KB_INGEST' };

describe('StructuredOutputService', () => {
  let service: StructuredOutputService;
  let aiTelemetry: { record: jest.Mock; assertBudget: jest.Mock };

  beforeEach(() => {
    aiTelemetry = {
      record: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      assertBudget: jest.fn().mockResolvedValue({ state: 'ok' }),
    };
    // A real resolver on the platform OpenRouter route; the model call itself is mocked (`generateText`).
    service = new StructuredOutputService(aiTelemetry as any, makeResolver({ config: OPENROUTER }).resolver);
    (generateText as jest.Mock).mockReset();
  });

  describe('extract — routing', () => {
    it("calls the model the tenant's route resolves, tuned for the alias", async () => {
      (generateText as jest.Mock).mockResolvedValue({ output: { name: 'x' } });

      await service.extract({
        messages: [],
        schema: z.object({ name: z.string() }),
        modelAlias: 'standard',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: CTX,
      });

      expect((generateText as jest.Mock).mock.calls[0][0].model).toMatchObject({
        modelId: 'anthropic/claude-sonnet-5.5',
      });
    });

    it('refuses a zero-retention tenant before the prompt leaves: no model call, no ledger row', async () => {
      const zdr = makeResolver({ aiZeroRetention: true, config: OPENROUTER });
      service = new StructuredOutputService(aiTelemetry as any, zdr.resolver);

      await expect(
        service.extract({
          messages: [{ role: 'user', content: 'secret' }],
          schema: z.object({ name: z.string() }),
          modelAlias: 'fast',
          systemPrompt: 'p',
          timeoutMs: 30000,
          maxOutputTokens: 1024,
          enforceBudget: true,
          aiContext: CTX,
        }),
      ).rejects.toThrow(ZeroRetentionUnavailable);

      expect(generateText).not.toHaveBeenCalled();
      expect(aiTelemetry.record).not.toHaveBeenCalled();
    });

    it('answers AiNotConfigured when no route serves language, without calling a model', async () => {
      service = new StructuredOutputService(aiTelemetry as any, makeResolver().resolver);

      await expect(
        service.extract({
          messages: [],
          schema: z.object({ name: z.string() }),
          modelAlias: 'fast',
          systemPrompt: 'p',
          timeoutMs: 30000,
          maxOutputTokens: 1024,
          aiContext: CTX,
        }),
      ).rejects.toThrow(AiNotConfigured);
      expect(generateText).not.toHaveBeenCalled();
    });
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
        aiContext: CTX,
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
        aiContext: CTX,
      });

      expect(result.object).toEqual({ name: 'test' });
      expect(generateText).toHaveBeenCalled();
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
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        routeId: 'platform-openrouter',
        credentialType: 'PLATFORM_OPENROUTER',
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

    it("maps every model alias to its id on the route's column (the pricing row's model)", async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { ok: true },
        usage: { promptTokens: 1, completionTokens: 1 },
      });

      for (const [alias, expected] of [
        ['fast', 'anthropic/claude-haiku-5.5'],
        ['standard', 'anthropic/claude-sonnet-5.5'],
        ['powerful', 'anthropic/claude-opus-5.5'],
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
        response: { modelId: 'anthropic/claude-sonnet-5.5' },
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

      expect(aiTelemetry.record.mock.calls[0][0].model).toBe('anthropic/claude-sonnet-5.5');
    });

    it('keeps the alias model id when the provider reports an id with no pricing row (e.g. dated)', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { name: 'x' },
        usage: { inputTokens: 10, outputTokens: 5 },
        response: { modelId: 'anthropic/claude-haiku-5.5-20261001' },
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

      expect(aiTelemetry.record.mock.calls[0][0].model).toBe('anthropic/claude-haiku-5.5');
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

    it('never checks the platform cap on a route the workspace pays for, even when it is over the cap', async () => {
      // The workspace's own credential: same route shape, the tenant pays.
      const platform = makeResolver({ config: OPENROUTER }).resolver;
      const ownKey = {
        resolve: async (tenantId: number, need: 'language' | 'embedding') => ({
          ...(await platform.resolve(tenantId, need)),
          routeId: 'aicred_x1',
          credentialType: 'ANTHROPIC_KEY',
          payer: 'TENANT' as const,
        }),
      };
      service = new StructuredOutputService(aiTelemetry as any, ownKey as any);
      aiTelemetry.assertBudget.mockRejectedValue(new Error('AiBudgetExceededError'));
      (generateText as jest.Mock).mockResolvedValue({ output: { x: 1 }, usage: { inputTokens: 1, outputTokens: 1 } });

      const result = await service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'fast',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        enforceBudget: true,
        aiContext: ctx,
      });

      expect(result.object).toEqual({ x: 1 });
      expect(aiTelemetry.assertBudget).not.toHaveBeenCalled();
      expect(aiTelemetry.record.mock.calls[0][0]).toMatchObject({
        routeId: 'aicred_x1',
        credentialType: 'ANTHROPIC_KEY',
      });
    });
  });

  describe('extract — cache usage and provider refusals', () => {
    const ctx: AiCallContext = { tenantId: 7, surface: 'KB_INGEST' };
    const call = () =>
      service.extract({
        messages: [],
        schema: z.object({ x: z.number() }),
        modelAlias: 'standard',
        systemPrompt: 'p',
        timeoutMs: 30000,
        maxOutputTokens: 1024,
        aiContext: ctx,
      });

    it('records cache reads and cache writes read through usageFromAiSdk', async () => {
      (generateText as jest.Mock).mockResolvedValue({
        output: { x: 1 },
        usage: {
          inputTokens: 5400,
          outputTokens: 410,
          inputTokenDetails: { cacheReadTokens: 3000, cacheWriteTokens: 1200 },
        },
      });
      await call();
      expect(aiTelemetry.record.mock.calls[0][0]).toMatchObject({
        promptTokens: 5400,
        completionTokens: 410,
        cachedTokens: 3000,
        cacheWriteTokens: 1200,
      });
    });

    it('turns a provider credit refusal into the budget error every surface handles, and still records the row', async () => {
      (generateText as jest.Mock).mockRejectedValue(
        Object.assign(new Error('This request requires more credits, or fewer max_tokens'), { statusCode: 402 }),
      );
      await expect(call()).rejects.toBeInstanceOf(AiProviderCreditRefused);
      expect(aiTelemetry.record.mock.calls[0][0]).toMatchObject({
        status: 'ERROR',
        errorCode: 'AiProviderCreditRefused',
      });
    });

    it('rethrows any other provider error unchanged', async () => {
      const boom = new Error('upstream 500');
      (generateText as jest.Mock).mockRejectedValue(boom);
      await expect(call()).rejects.toBe(boom);
    });
  });
});
