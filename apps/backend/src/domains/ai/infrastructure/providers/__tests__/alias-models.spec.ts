import { buildAliasModels } from '../ai-provider';
import { MODEL_CATALOG } from '../../../routing/model-catalog';

const finish = (unified: string) => ({
  content: unified === 'stop' ? [{ type: 'text', text: 'ok' }] : [],
  finishReason: { unified, raw: unified },
  usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  warnings: [],
});

/** A fake provider model per model id that refuses or answers on demand. */
function fakeBase(refusingIds: string[]) {
  const calls: Array<{ modelId: string; effort: unknown }> = [];
  const base = (modelId: string) =>
    ({
      specificationVersion: 'v3',
      provider: 'fake',
      modelId,
      supportedUrls: {},
      doGenerate: async (params: any) => {
        calls.push({ modelId, effort: params.providerOptions?.anthropic?.effort });
        return finish(refusingIds.includes(modelId) ? 'content-filter' : 'stop');
      },
      doStream: async () => {
        throw new Error('not used');
      },
    }) as any;
  return { base, calls };
}

const FAST = MODEL_CATALOG.fast.anthropicId;
const STANDARD = MODEL_CATALOG.standard.anthropicId;
const POWERFUL = MODEL_CATALOG.powerful.anthropicId;

describe('buildAliasModels (direct Anthropic)', () => {
  it('builds each alias on its catalog id with its effort', async () => {
    const { base, calls } = fakeBase([]);
    const models = buildAliasModels(base);

    await models.fast.doGenerate({ prompt: [] });
    await models.standard.doGenerate({ prompt: [] });
    await models.powerful.doGenerate({ prompt: [] });

    expect(calls).toEqual([
      { modelId: FAST, effort: 'low' },
      { modelId: STANDARD, effort: 'medium' },
      { modelId: POWERFUL, effort: 'medium' },
    ]);
  });

  it('retries a refused fast call once on standard with standard effort', async () => {
    const { base, calls } = fakeBase([FAST]);

    await buildAliasModels(base).fast.doGenerate({ prompt: [] });

    expect(calls).toEqual([
      { modelId: FAST, effort: 'low' },
      { modelId: STANDARD, effort: 'medium' },
    ]);
  });

  it('stops after one hop even when the fallback also refuses', async () => {
    const { base, calls } = fakeBase([FAST, STANDARD]);

    const result = await buildAliasModels(base).fast.doGenerate({ prompt: [] });

    expect(calls.map((c) => c.modelId)).toEqual([FAST, STANDARD]);
    expect(result.finishReason.unified).toBe('content-filter');
  });
});
