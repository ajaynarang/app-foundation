import { embed as embedImport, generateText as generateTextImport } from 'ai';
import { MODEL_ALIASES } from '@app/shared-types';
import { EMBEDDING_CATALOG, MODEL_CATALOG } from '../../src/domains/ai/routing/model-catalog';
import { CEILING, openRouterEffortOptions, runLiveChecks } from '../ai-live-check';

jest.mock('ai', () => ({ ...jest.requireActual('ai'), generateText: jest.fn(), embed: jest.fn() }));

const generateText = generateTextImport as jest.Mock;
const embed = embedImport as jest.Mock;

/**
 * The live check itself spends money and runs by hand. This spec runs its wiring offline, with the AI SDK calls
 * mocked: which legs run for which keys, and what the OpenRouter leg sends (the catalog slug, the alias's effort as
 * OpenRouter's `reasoning.effort`, the smallest ceiling).
 */
describe('ai-live-check (offline)', () => {
  beforeEach(() => {
    generateText.mockReset();
    embed.mockReset();
  });

  it('runs nothing and calls no provider when no key is set', async () => {
    const { lines, skipped } = await runLiveChecks({});
    expect(lines).toEqual([]);
    expect(skipped).toHaveLength(3);
    expect(generateText).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });

  it('openrouter leg: a plain and a structured call per alias on the catalog slug, with effort and the ceiling', async () => {
    generateText.mockImplementation(async (args: { output?: unknown; model: { modelId: string } }) => ({
      finishReason: 'stop',
      text: 'ready',
      output: args.output ? { verdict: 'yes' } : undefined,
      usage: { outputTokens: 12 },
      response: { modelId: args.model.modelId },
    }));
    const { lines, skipped } = await runLiveChecks({ OPENROUTER_API_KEY: 'sk-or-test' });

    expect(skipped).toEqual(['anthropic (ANTHROPIC_API_KEY is not set)', 'cohere (COHERE_API_KEY is not set)']);
    expect(lines).toHaveLength(MODEL_ALIASES.length * 2);
    expect(lines.every((l) => l.ok && l.leg === 'openrouter')).toBe(true);
    for (const alias of MODEL_ALIASES) {
      const calls = generateText.mock.calls
        .map((c) => c[0])
        .filter((a) => a.model.modelId === MODEL_CATALOG[alias].openrouterId);
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.maxOutputTokens).toBe(CEILING);
        expect(call.providerOptions).toEqual({
          openrouter: { reasoning: { effort: MODEL_CATALOG[alias].effort } },
        });
      }
    }
  });

  it("anthropic leg: a plain and a structured call per alias on the catalog's anthropicId, at the ceiling", async () => {
    generateText.mockImplementation(async (args: { output?: unknown; model: { modelId: string } }) => ({
      finishReason: 'stop',
      text: 'ready',
      output: args.output ? { verdict: 'yes' } : undefined,
      usage: { outputTokens: 12 },
      response: { modelId: args.model.modelId },
    }));
    const { lines } = await runLiveChecks({ ANTHROPIC_API_KEY: 'sk-ant-test' });

    expect(lines).toHaveLength(MODEL_ALIASES.length * 2);
    expect(lines.every((l) => l.ok && l.leg === 'anthropic')).toBe(true);
    const ids = generateText.mock.calls.map((c) => c[0].model.modelId);
    expect(new Set(ids)).toEqual(new Set(MODEL_ALIASES.map((alias) => MODEL_CATALOG[alias].anthropicId)));
    expect(generateText.mock.calls.every((c) => c[0].maxOutputTokens === CEILING)).toBe(true);
  });

  it('a refused or empty answer is a FAIL line, not a crash', async () => {
    generateText.mockRejectedValueOnce(new Error('402 credit')).mockResolvedValue({
      finishReason: 'length',
      text: '',
      usage: { outputTokens: CEILING },
      response: { modelId: 'x' },
    });
    const { lines } = await runLiveChecks({ OPENROUTER_API_KEY: 'sk-or-test' });
    expect(lines.some((l) => l.ok)).toBe(false);
    expect(lines[0].detail).toContain('402 credit');
  });

  it('cohere leg: one query embedding that must come back at 1536 dimensions', async () => {
    embed.mockResolvedValue({ embedding: new Array(EMBEDDING_CATALOG.dimensions).fill(0), usage: { tokens: 1 } });
    const { lines } = await runLiveChecks({ COHERE_API_KEY: 'co-test' });
    expect(lines).toEqual([expect.objectContaining({ leg: 'cohere', kind: 'embedding', ok: true })]);
    expect(embed.mock.calls[0][0].providerOptions).toEqual({
      cohere: { inputType: 'search_query', outputDimension: 1536 },
    });

    embed.mockResolvedValue({ embedding: [0, 0, 0], usage: { tokens: 1 } });
    expect((await runLiveChecks({ COHERE_API_KEY: 'co-test' })).lines[0].ok).toBe(false);
  });

  it('effort options follow the catalog', () => {
    expect(openRouterEffortOptions('fast')).toEqual({ openrouter: { reasoning: { effort: 'low' } } });
  });
});
