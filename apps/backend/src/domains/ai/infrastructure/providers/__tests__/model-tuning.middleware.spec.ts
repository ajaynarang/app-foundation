import { modelTuningMiddleware } from '../model-tuning.middleware';

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

  it("writes effort under the route family's own provider options key", async () => {
    const out = await modelTuningMiddleware({ alias: 'fast', optionsKey: 'openrouter' }).transformParams({
      params: params(),
      type: 'generate',
      model: {} as any,
    });
    expect(out.providerOptions).toEqual({ openrouter: { effort: 'low' } });
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
