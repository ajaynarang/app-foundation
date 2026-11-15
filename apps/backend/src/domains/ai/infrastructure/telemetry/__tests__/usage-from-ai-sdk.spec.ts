import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureUsageShape, usageFromAiSdk } from '../usage-from-ai-sdk';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', 'usage', `${name}.json`), 'utf8'));
}

describe('usageFromAiSdk', () => {
  it("reads Mastra's normalised cache fields on the agent path", () => {
    expect(usageFromAiSdk(fixture('mastra-agent-anthropic'))).toEqual({
      promptTokens: 48210,
      completionTokens: 1830,
      cachedTokens: 39870,
      cacheWriteTokens: 6120,
    });
  });

  it("falls back to provider metadata when Mastra's accumulator turned a missing count into 0", () => {
    expect(usageFromAiSdk(fixture('mastra-agent-openrouter-zero-write'))).toEqual({
      promptTokens: 30500,
      completionTokens: 900,
      cachedTokens: 24000,
      cacheWriteTokens: 0,
    });
  });

  it('reads inputTokenDetails on the generateText path', () => {
    expect(usageFromAiSdk(fixture('generate-text-anthropic'))).toEqual({
      promptTokens: 5400,
      completionTokens: 410,
      cachedTokens: 3000,
      cacheWriteTokens: 1200,
    });
  });

  it('falls back to Anthropic provider metadata', () => {
    expect(usageFromAiSdk(fixture('generate-text-anthropic-metadata-only'))).toEqual({
      promptTokens: 5400,
      completionTokens: 410,
      cachedTokens: 3000,
      cacheWriteTokens: 1200,
    });
  });

  it('falls back to Bedrock provider metadata', () => {
    expect(usageFromAiSdk(fixture('generate-text-bedrock'))).toEqual({
      promptTokens: 7000,
      completionTokens: 600,
      cachedTokens: 4500,
      cacheWriteTokens: 1500,
    });
  });

  it("falls back to OpenRouter's metadata and raw usage", () => {
    expect(usageFromAiSdk(fixture('generate-text-openrouter'))).toEqual({
      promptTokens: 9000,
      completionTokens: 700,
      cachedTokens: 6000,
      cacheWriteTokens: 2000,
    });
  });

  describe('live captures (OpenRouter → Anthropic)', () => {
    it('a tool loop with automatic caching: run totals, cache read and write inside the prompt', () => {
      expect(usageFromAiSdk(fixture('live-openrouter-agent-automatic-cache'))).toEqual({
        promptTokens: 1316595,
        completionTokens: 13828,
        cachedTokens: 1281554,
        cacheWriteTokens: 34988,
      });
    });

    it('a tool loop with a message breakpoint set before Mastra: nothing read, a little written', () => {
      expect(usageFromAiSdk(fixture('live-openrouter-agent-message-breakpoint'))).toEqual({
        promptTokens: 373313,
        completionTokens: 12382,
        cachedTokens: 0,
        cacheWriteTokens: 2441,
      });
    });

    it('an uncached stream and a short call: zero cache counts reported as zero, not missing', () => {
      expect(usageFromAiSdk(fixture('live-openrouter-agent-stream-uncached'))).toMatchObject({
        cachedTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(usageFromAiSdk(fixture('live-openrouter-generate-text-short'))).toEqual({
        promptTokens: 7192,
        completionTokens: expect.any(Number),
        cachedTokens: 0,
        cacheWriteTokens: 0,
      });
    });
  });

  it('leaves the cache counts undefined when nothing reports them', () => {
    expect(usageFromAiSdk({ usage: { promptTokens: 10, completionTokens: 4 } })).toEqual({
      promptTokens: 10,
      completionTokens: 4,
      cachedTokens: undefined,
      cacheWriteTokens: undefined,
    });
  });

  it('reads totalUsage when usage is absent', () => {
    expect(usageFromAiSdk({ totalUsage: { inputTokens: 12, outputTokens: 3 } })).toMatchObject({
      promptTokens: 12,
      completionTokens: 3,
    });
  });

  it('keeps promptTokens at least the cached plus written tokens (the ledger meaning)', () => {
    const usage = usageFromAiSdk({ usage: { inputTokens: 100, cachedInputTokens: 300, cacheCreationInputTokens: 50 } });
    expect(usage.promptTokens).toBe(350);
  });

  it('returns zeros for a missing or malformed result', () => {
    for (const result of [undefined, null, 'text', { usage: 'nope' }, { usage: { inputTokens: Number.NaN } }]) {
      expect(usageFromAiSdk(result)).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: undefined,
        cacheWriteTokens: undefined,
      });
    }
  });

  it('reads the v4-era cached names a legacy shape may still carry', () => {
    expect(
      usageFromAiSdk({ usage: { promptTokens: 50, completionTokens: 5, cachedPromptTokens: 20 } }).cachedTokens,
    ).toBe(20);
  });
});

describe('captureUsageShape (a developer machine only)', () => {
  it('writes numbers and provider names only, never other strings or arrays', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-capture-'));
    try {
      captureUsageShape(
        'chat-agent',
        {
          text: 'secret code text',
          usage: { inputTokens: 10, cachedInputTokens: 5, raw: { note: 'drop me', prompt_tokens: 10 } },
          providerMetadata: { openrouter: { provider: 'Anthropic', reasoning_details: [{ text: 'x' }] } },
        },
        dir,
      );
      const [file] = readdirSync(dir);
      const written = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      expect(written).toEqual({
        usage: { inputTokens: 10, cachedInputTokens: 5, raw: { prompt_tokens: 10 } },
        providerMetadata: { openrouter: { provider: 'Anthropic' } },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does nothing without a directory, and never throws', () => {
    expect(() => captureUsageShape('x', { usage: { a: 1 } }, '/nonexistent/\0bad')).not.toThrow();
    expect(() => captureUsageShape('x', {}, undefined)).not.toThrow();
    expect(() => captureUsageShape('x', {}, '')).not.toThrow();
  });

  it('sums cache writes over a multi-step result’s steps — the root providerMetadata is the last step only', () => {
    const step = (written: number) => ({ providerMetadata: { anthropic: { cacheCreationInputTokens: written } } });
    const out = usageFromAiSdk({
      usage: { inputTokens: 5_000, outputTokens: 50 },
      providerMetadata: { anthropic: { cacheCreationInputTokens: 300 } },
      steps: [step(1_000), step(200), step(300)],
    });
    expect(out.cacheWriteTokens).toBe(1_500);
  });

  it('a single-step result still reads the root providerMetadata', () => {
    const out = usageFromAiSdk({
      usage: { inputTokens: 5_000, outputTokens: 50 },
      providerMetadata: { bedrock: { usage: { cacheWriteInputTokens: 400, cacheReadInputTokens: 900 } } },
      steps: [{ providerMetadata: { bedrock: { usage: { cacheWriteInputTokens: 400 } } } }],
    });
    expect(out).toEqual(expect.objectContaining({ cacheWriteTokens: 400, cachedTokens: 900 }));
  });
});
