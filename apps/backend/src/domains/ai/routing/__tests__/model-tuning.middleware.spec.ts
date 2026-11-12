import { effortProviderOptions, modelTuningMiddleware, tunedLanguageModel } from '../model-tuning.middleware';
import { MODEL_CATALOG } from '../model-catalog';

const params = (providerOptions?: Record<string, unknown>) => ({ prompt: [], providerOptions }) as any;
const result = (unified: string) => ({ finishReason: { unified, raw: unified }, content: [], usage: {} }) as any;

describe('modelTuningMiddleware', () => {
  it('adds the alias effort from the catalog to the Anthropic provider options, keeping the others', async () => {
    const mw = modelTuningMiddleware({ alias: 'fast' });

    const out = await mw.transformParams({
      params: params({ anthropic: { cacheControl: { type: 'ephemeral' } }, gateway: { only: ['anthropic'] } }),
      type: 'generate',
      model: {} as any,
    });

    expect(out.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' }, effort: 'low' },
      gateway: { only: ['anthropic'] },
    });
  });

  it('sets medium effort on standard and powerful', async () => {
    for (const alias of ['standard', 'powerful'] as const) {
      const out = await modelTuningMiddleware({ alias }).transformParams({
        params: params(),
        type: 'stream',
        model: {} as any,
      });
      expect(out.providerOptions).toEqual({ anthropic: { effort: 'medium' } });
    }
  });

  it("writes effort in the OpenRouter family's own shape (`reasoning.effort`), keeping its other options", async () => {
    const out = await modelTuningMiddleware({ alias: 'fast', family: 'openrouter' }).transformParams({
      params: params({ openrouter: { cacheControl: { type: 'ephemeral' } } }),
      type: 'generate',
      model: {} as any,
    });
    expect(out.providerOptions).toEqual({
      openrouter: { cacheControl: { type: 'ephemeral' }, reasoning: { effort: 'low' } },
    });
  });

  it('returns the first answer when the model did not refuse', async () => {
    const fallback = { doGenerate: jest.fn() };
    const mw = modelTuningMiddleware({ alias: 'fast', fallback: fallback as any });
    const ok = result('stop');

    const out = await mw.wrapGenerate({ doGenerate: async () => ok, params: params(), model: {} as any } as any);

    expect(out).toBe(ok);
    expect(fallback.doGenerate).not.toHaveBeenCalled();
  });

  it('retries a refused generate call once on the fallback model', async () => {
    const rescued = result('stop');
    const fallback = { doGenerate: jest.fn().mockResolvedValue(rescued) };
    const mw = modelTuningMiddleware({ alias: 'fast', fallback: fallback as any });
    const p = params();

    const out = await mw.wrapGenerate({
      doGenerate: async () => result('content-filter'),
      params: p,
      model: {} as any,
    } as any);

    expect(fallback.doGenerate).toHaveBeenCalledWith(p);
    expect(out).toBe(rescued);
  });

  it('keeps the refusal when there is no fallback (the top alias)', async () => {
    const mw = modelTuningMiddleware({ alias: 'powerful' });
    const refused = result('content-filter');

    const out = await mw.wrapGenerate({ doGenerate: async () => refused, params: params(), model: {} as any } as any);

    expect(out).toBe(refused);
  });
});

describe('effortProviderOptions', () => {
  it('names the alias effort under each route family key', () => {
    expect(effortProviderOptions('anthropic', 'fast')).toEqual({ anthropic: { effort: 'low' } });
    expect(effortProviderOptions('openrouter', 'standard')).toEqual({
      openrouter: { reasoning: { effort: 'medium' } },
    });
  });
});

const finish = (unified: string) => ({
  content: unified === 'stop' ? [{ type: 'text', text: 'ok' }] : [],
  finishReason: { unified, raw: unified },
  usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  warnings: [],
});

/** A fake provider model per alias on one route family, recording the options each call carried. */
function fakeRoute(refusing: string[], unregistered: string[] = []) {
  const calls: Array<{ alias: string; options: unknown }> = [];
  const base = (alias: string) => {
    if (unregistered.includes(alias)) throw new Error(`${alias} is not on this route`);
    return {
      specificationVersion: 'v3',
      provider: 'fake',
      modelId: `fake-${alias}`,
      supportedUrls: {},
      doGenerate: async (p: any) => {
        calls.push({ alias, options: p.providerOptions });
        return finish(refusing.includes(alias) ? 'content-filter' : 'stop');
      },
      doStream: async () => {
        throw new Error('not used');
      },
    } as any;
  };
  return { base, calls };
}

describe('tunedLanguageModel (applied per route by the resolver)', () => {
  it("sends the alias effort in the route family's shape", async () => {
    const { base, calls } = fakeRoute([]);
    await tunedLanguageModel(base, 'fast', 'openrouter').doGenerate({ prompt: [] });
    expect(calls).toEqual([
      { alias: 'fast', options: { openrouter: { reasoning: { effort: MODEL_CATALOG.fast.effort } } } },
    ]);
  });

  it('retries a refused call once, one alias up, with that alias effort', async () => {
    const { base, calls } = fakeRoute(['fast']);
    await tunedLanguageModel(base, 'fast', 'openrouter').doGenerate({ prompt: [] });
    expect(calls.map((c) => c.alias)).toEqual(['fast', 'standard']);
    expect(calls[1].options).toEqual({ openrouter: { reasoning: { effort: MODEL_CATALOG.standard.effort } } });
  });

  it('stops after one hop even when the fallback refuses too', async () => {
    const { base, calls } = fakeRoute(['fast', 'standard']);
    const out = await tunedLanguageModel(base, 'fast', 'anthropic').doGenerate({ prompt: [] });
    expect(calls.map((c) => c.alias)).toEqual(['fast', 'standard']);
    expect(out.finishReason.unified).toBe('content-filter');
  });

  it('has no fallback when the next alias is not registered on the route', async () => {
    const { base, calls } = fakeRoute(['standard'], ['powerful']);
    const out = await tunedLanguageModel(base, 'standard', 'openrouter').doGenerate({ prompt: [] });
    expect(calls.map((c) => c.alias)).toEqual(['standard']);
    expect(out.finishReason.unified).toBe('content-filter');
  });
});
