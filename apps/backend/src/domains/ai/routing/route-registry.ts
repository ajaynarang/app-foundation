import { createCohere } from '@ai-sdk/cohere';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ModelAlias } from '@app/shared-types';

import {
  AI_PROVIDER_LABELS,
  EMBEDDING_CATALOG,
  MODEL_CATALOG,
  ledgerModelIdFor,
  type RouteIdColumn,
} from './model-catalog';
import { AiModelNotOnRoute } from './ai-model-not-on-route.error';
import type { AiNeed, ProviderBundle, RetentionClass } from './routing.types';
import type { PromptCacheStrategy } from './prompt-cache';

/** Ledger `credentialType` strings for the platform's own routes. "Platform paid" is derived from the prefix. */
export const PLATFORM_CREDENTIAL_TYPES = {
  OPENROUTER: 'PLATFORM_OPENROUTER',
  COHERE: 'PLATFORM_COHERE',
} as const;

/**
 * The platform keys a route reads. The resolver fills this from `ConfigService` (the zod schema in
 * `config/configuration.ts`); nothing under `routing/` reads `process.env`.
 */
export interface PlatformRouteConfig {
  openRouterApiKey?: string;
  cohereApiKey?: string;
}

export interface PlatformRoute {
  routeId: 'platform-openrouter' | 'platform-cohere';
  credentialType: (typeof PLATFORM_CREDENTIAL_TYPES)[keyof typeof PLATFORM_CREDENTIAL_TYPES];
  serves: readonly AiNeed[];
  retention: RetentionClass;
  /** How the route marks prompt-cache breakpoints on its language models (`prompt-cache.ts`). */
  promptCache: PromptCacheStrategy;
  /** True when the route's key is set: every route is off until then. */
  isConfigured: (config: PlatformRouteConfig) => boolean;
  buildProvider: (config: PlatformRouteConfig) => ProviderBundle;
}

/**
 * The model id for `alias` on a route that reads `column`. An alias the catalog left without an id on that column
 * (the 5.5 model could not be confirmed there) is refused with a typed error; no other model is ever substituted.
 */
export function catalogModelId(alias: ModelAlias, column: RouteIdColumn, routeId: string): string {
  const id = MODEL_CATALOG[alias][column];
  if (!id) throw new AiModelNotOnRoute(alias, routeId);
  return id;
}

/**
 * The platform's own routes, keyed by environment variables, never the database. ORDER IS THE PREFERENCE ORDER within
 * a need after filtering. Workspace credential types (bring-your-own-key) and the zero-retention platform route join
 * this registry later; each adds an entry, the resolver does not change shape.
 */
export const PLATFORM_ROUTES: readonly PlatformRoute[] = [
  {
    routeId: 'platform-openrouter',
    credentialType: PLATFORM_CREDENTIAL_TYPES.OPENROUTER,
    serves: ['language'],
    retention: 'STANDARD',
    promptCache: 'openrouter',
    isConfigured: (config) => !!config.openRouterApiKey,
    buildProvider: (config) => {
      const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });
      const modelIdFor = (alias: ModelAlias) => catalogModelId(alias, 'openrouterId', 'platform-openrouter');
      return {
        providerLabel: AI_PROVIDER_LABELS.OPENROUTER,
        languageModel: (alias: ModelAlias) => openrouter.chat(modelIdFor(alias)),
        modelIdFor,
        effortFamily: 'openrouter',
        ledgerModelIdFor: (alias: ModelAlias, answeredByModelId?: string) =>
          ledgerModelIdFor(alias, answeredByModelId, 'openrouterId'),
      };
    },
  },
  {
    routeId: 'platform-cohere',
    credentialType: PLATFORM_CREDENTIAL_TYPES.COHERE,
    serves: ['embedding'],
    retention: 'STANDARD',
    promptCache: 'none', // embeddings only
    isConfigured: (config) => !!config.cohereApiKey,
    buildProvider: (config) => {
      const cohere = createCohere({ apiKey: config.cohereApiKey });
      return {
        providerLabel: AI_PROVIDER_LABELS.COHERE,
        embeddingModel: () => cohere.embeddingModel(EMBEDDING_CATALOG.cohereDirectId),
        embeddingModelId: EMBEDDING_CATALOG.cohereDirectId,
      };
    },
  },
];
