import { MODEL_ALIASES } from '@app/shared-types';
import { PLATFORM_ROUTES, type PlatformRouteConfig } from '../route-registry';
import { EMBEDDING_CATALOG, MODEL_CATALOG, UNREGISTERED_ALIASES } from '../model-catalog';
import { AiModelNotOnRoute } from '../ai-model-not-on-route.error';

/**
 * Builder-shape spec: every registry entry builds a working bundle (provider objects are constructed for real, which
 * is pure: no network I/O) whose model ids come from the catalog. Guards against an entry that declares a need its
 * bundle cannot build. Config comes in as a value, never from `process.env`.
 */
describe('route registry builders', () => {
  const CONFIGURED: PlatformRouteConfig = { openRouterApiKey: 'sk-or-test', cohereApiKey: 'co-test' };
  const route = (id: string) => {
    const found = PLATFORM_ROUTES.find((r) => r.routeId === id);
    if (!found) throw new Error(`no route ${id}`);
    return found;
  };

  it('every platform route builds its declared bundle when configured', () => {
    for (const r of PLATFORM_ROUTES) {
      expect(r.isConfigured(CONFIGURED)).toBe(true);
      const bundle = r.buildProvider(CONFIGURED);
      expect(bundle.providerLabel).toBeTruthy();
      if (r.serves.includes('language')) {
        expect(bundle.languageModel?.('standard')).toBeDefined();
        expect(bundle.modelIdFor?.('standard')).toBeTruthy();
        // The resolver tunes every language model in the route family's shape and prices it on the route's column.
        expect(bundle.effortFamily).toBeTruthy();
        expect(bundle.ledgerModelIdFor?.('standard')).toBe(bundle.modelIdFor?.('standard'));
      } else {
        expect(bundle.languageModel).toBeUndefined();
      }
      if (r.serves.includes('embedding')) {
        expect(bundle.embeddingModel?.()).toBeDefined();
        expect(bundle.embeddingModelId).toBeTruthy();
      } else {
        expect(bundle.embeddingModel).toBeUndefined();
      }
    }
  });

  it('platform routes report unconfigured when their key is absent or blank', () => {
    for (const r of PLATFORM_ROUTES) {
      expect(r.isConfigured({})).toBe(false);
      expect(r.isConfigured({ openRouterApiKey: '', cohereApiKey: '' })).toBe(false);
    }
  });

  it('each route reads only its own key', () => {
    expect(route('platform-openrouter').isConfigured({ cohereApiKey: 'co-test' })).toBe(false);
    expect(route('platform-cohere').isConfigured({ openRouterApiKey: 'sk-or-test' })).toBe(false);
  });

  it('platform-openrouter serves every alias by its catalog openrouterId, labelled openrouter', () => {
    const bundle = route('platform-openrouter').buildProvider(CONFIGURED);
    expect(bundle.providerLabel).toBe('openrouter');
    for (const alias of MODEL_ALIASES) {
      if ((UNREGISTERED_ALIASES.openrouterId ?? []).includes(alias)) continue;
      expect(bundle.modelIdFor?.(alias)).toBe(MODEL_CATALOG[alias].openrouterId);
      expect(bundle.languageModel?.(alias)).toMatchObject({ modelId: MODEL_CATALOG[alias].openrouterId });
    }
  });

  it('platform-openrouter refuses an alias the catalog left without an openrouterId, never another model', () => {
    const original = MODEL_CATALOG.powerful.openrouterId;
    MODEL_CATALOG.powerful.openrouterId = undefined;
    try {
      const bundle = route('platform-openrouter').buildProvider(CONFIGURED);
      expect(() => bundle.languageModel?.('powerful')).toThrow(AiModelNotOnRoute);
      expect(() => bundle.modelIdFor?.('powerful')).toThrow(AiModelNotOnRoute);
      expect(bundle.modelIdFor?.('fast')).toBe(MODEL_CATALOG.fast.openrouterId);
    } finally {
      MODEL_CATALOG.powerful.openrouterId = original;
    }
  });

  it('platform-openrouter takes effort the OpenRouter way', () => {
    expect(route('platform-openrouter').buildProvider(CONFIGURED).effortFamily).toBe('openrouter');
  });

  it('platform-cohere embeds with Cohere Embed v4, labelled cohere', () => {
    const bundle = route('platform-cohere').buildProvider(CONFIGURED);
    expect(bundle.providerLabel).toBe('cohere');
    expect(bundle.embeddingModelId).toBe(EMBEDDING_CATALOG.cohereDirectId);
    expect(bundle.embeddingModel?.()).toMatchObject({ modelId: EMBEDDING_CATALOG.cohereDirectId });
  });
});
