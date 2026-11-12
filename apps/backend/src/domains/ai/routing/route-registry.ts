import { createAnthropic } from '@ai-sdk/anthropic';
import { createCohere } from '@ai-sdk/cohere';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGateway, wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { AiCredentialType, type AiCredential } from '@appshore/db';
import type { ModelAlias } from '@app/shared-types';

import {
  AI_PROVIDER_LABELS,
  EMBEDDING_CATALOG,
  MODEL_CATALOG,
  ledgerModelIdFor,
  type RouteIdColumn,
} from './model-catalog';
import { AiModelNotOnRoute } from './ai-model-not-on-route.error';
import { AiCredentialFailing } from './ai-credential-failing.error';
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

/**
 * Pins a tenant Vercel AI Gateway key to Anthropic (`providerOptions.gateway.only`). Without it the gateway falls back
 * to other vendors when Anthropic rate-limits, which the workspace never approved. The caller's other gateway options
 * are kept.
 */
export const anthropicOnlyMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: ({ params }) => {
    const providerOptions = (params.providerOptions ?? {}) as Record<string, Record<string, unknown> | undefined>;
    return Promise.resolve({
      ...params,
      providerOptions: {
        ...providerOptions,
        gateway: { ...(providerOptions.gateway ?? {}), only: ['anthropic'] },
      } as typeof params.providerOptions,
    });
  },
};

/** What a workspace credential type is: what it serves, its retention, its cache strategy, and how to build it. */
export interface TenantCapability {
  serves: readonly AiNeed[];
  promptCache: PromptCacheStrategy;
  /** Retention is per row: an Anthropic key is zero-retention only when its owner attested to it. */
  retention: (credential: Pick<AiCredential, 'zdrAttested'>) => RetentionClass;
  /** `secret` is the decrypted key, or null for a type that stores none. */
  buildProvider: (credential: Pick<AiCredential, 'type' | 'publicId'>, secret: string | null) => ProviderBundle;
}

/** The types a workspace connects by pasting a key. The connect API takes these and nothing else. */
export const PASTE_KEY_TYPES = [
  AiCredentialType.ANTHROPIC_KEY,
  AiCredentialType.OPENROUTER_KEY,
  AiCredentialType.VERCEL_GATEWAY_KEY,
] as const;
export type PasteKeyType = (typeof PASTE_KEY_TYPES)[number];

/**
 * A paste-key type with no readable secret (the row's envelope could not be decrypted) is a failing credential: the
 * workspace is refused, never served on the platform's key.
 */
function requireSecret(secret: string | null): string {
  if (!secret) throw new AiCredentialFailing('language');
  return secret;
}

/**
 * Workspace credential types (bring-your-own-key), in code, never the database. Every `AiCredentialType` has an entry;
 * the parity spec fails otherwise. A workspace's credentials form their own pool, so the workspace pays: the resolver
 * never mixes them with the platform routes above.
 */
export const TENANT_CREDENTIAL_CAPABILITIES: Record<AiCredentialType, TenantCapability> = {
  [AiCredentialType.ANTHROPIC_KEY]: {
    serves: ['language'],
    promptCache: 'anthropic',
    // Anthropic offers zero retention per organisation, by agreement. The owner attests to it per key.
    retention: (credential) => (credential.zdrAttested ? 'ZDR' : 'STANDARD'),
    buildProvider: (credential, secret) => {
      const anthropic = createAnthropic({ apiKey: requireSecret(secret) });
      const modelIdFor = (alias: ModelAlias) => catalogModelId(alias, 'anthropicId', credential.publicId);
      return {
        providerLabel: AI_PROVIDER_LABELS.ANTHROPIC,
        languageModel: (alias: ModelAlias) => anthropic(modelIdFor(alias)),
        modelIdFor,
        effortFamily: 'anthropic',
        ledgerModelIdFor: (alias: ModelAlias, answeredByModelId?: string) =>
          ledgerModelIdFor(alias, answeredByModelId, 'anthropicId'),
      };
    },
  },
  [AiCredentialType.OPENROUTER_KEY]: {
    serves: ['language'],
    // Every catalog alias is an Anthropic model, which OpenRouter caches through `cache_control`.
    promptCache: 'openrouter',
    // Zero retention on a workspace OpenRouter key is out of scope; the type is always standard.
    retention: () => 'STANDARD',
    buildProvider: (credential, secret) => {
      const openrouter = createOpenRouter({ apiKey: requireSecret(secret) });
      const modelIdFor = (alias: ModelAlias) => catalogModelId(alias, 'openrouterId', credential.publicId);
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
  [AiCredentialType.VERCEL_GATEWAY_KEY]: {
    serves: ['language'],
    promptCache: 'none', // until someone verifies the gateway forwards Anthropic cache control
    retention: () => 'STANDARD',
    buildProvider: (credential, secret) => {
      const gateway = createGateway({ apiKey: requireSecret(secret) });
      return {
        // The middleware pins the gateway to Anthropic, so Anthropic's model ran: the ledger records that pair, which
        // has a pricing row. The request itself uses the gateway's dotted slug (the OpenRouter form).
        providerLabel: AI_PROVIDER_LABELS.ANTHROPIC,
        languageModel: (alias: ModelAlias) =>
          wrapLanguageModel({
            model: gateway(catalogModelId(alias, 'openrouterId', credential.publicId)),
            middleware: anthropicOnlyMiddleware,
          }),
        modelIdFor: (alias: ModelAlias) => catalogModelId(alias, 'anthropicId', credential.publicId),
        // The gateway forwards `providerOptions.anthropic` to Anthropic.
        effortFamily: 'anthropic',
        ledgerModelIdFor: (alias: ModelAlias, answeredByModelId?: string) =>
          ledgerModelIdFor(alias, answeredByModelId, 'anthropicId'),
      };
    },
  },
  // A workspace's own AWS account, through a cross-account role. The enum value exists so that flow needs no
  // migration; until it ships the type serves nothing and the connect API refuses it.
  [AiCredentialType.BEDROCK_ROLE]: {
    serves: [],
    promptCache: 'bedrock',
    retention: () => 'ZDR',
    buildProvider: () => {
      throw new Error('BEDROCK_ROLE has no route on this version: it serves nothing, so no resolve picks it');
    },
  },
};
