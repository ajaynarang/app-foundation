import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createCohere } from '@ai-sdk/cohere';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGateway, wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { fromNodeProviderChain, fromTemporaryCredentials } from '@aws-sdk/credential-providers';
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
import { FALLBACK_PROJECT_SLUG, bedrockSessionName } from './aws-role-naming';

/** Ledger `credentialType` strings for the platform's own routes. "Platform paid" is derived from the prefix. */
export const PLATFORM_CREDENTIAL_TYPES = {
  OPENROUTER: 'PLATFORM_OPENROUTER',
  COHERE: 'PLATFORM_COHERE',
  BEDROCK: 'PLATFORM_BEDROCK',
} as const;

/**
 * The platform keys a route reads. The resolver fills this from `ConfigService` (the zod schema in
 * `config/configuration.ts`); nothing under `routing/` reads `process.env`.
 */
export interface PlatformRouteConfig {
  openRouterApiKey?: string;
  cohereApiKey?: string;
  /** The AWS region of `platform-bedrock`. Setting it is the switch; the task's own credentials sign the calls. */
  platformBedrockRegion?: string;
}

export interface PlatformRoute {
  routeId: 'platform-openrouter' | 'platform-cohere' | 'platform-bedrock';
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

/** Signs Bedrock calls: the task's own credentials, or a workspace role's temporary ones. */
type BedrockCredentialProvider = NonNullable<Parameters<typeof createAmazonBedrock>[0]>['credentialProvider'];

/**
 * A Bedrock bundle: language on the catalog's `bedrockId` (an alias without one is refused, never substituted) and
 * Cohere Embed v4 for embeddings. Both Bedrock routes build through here, so they call the same models.
 */
function bedrockBundle(region: string, credentialProvider: BedrockCredentialProvider, routeId: string): ProviderBundle {
  const bedrock = createAmazonBedrock({ region, credentialProvider });
  const modelIdFor = (alias: ModelAlias) => catalogModelId(alias, 'bedrockId', routeId);
  return {
    providerLabel: AI_PROVIDER_LABELS.AWS,
    languageModel: (alias: ModelAlias) => bedrock(modelIdFor(alias)),
    modelIdFor,
    effortFamily: 'bedrock',
    ledgerModelIdFor: (alias: ModelAlias, answeredByModelId?: string) =>
      ledgerModelIdFor(alias, answeredByModelId, 'bedrockId'),
    embeddingModel: () => bedrock.embeddingModel(EMBEDDING_CATALOG.bedrockId),
    embeddingModelId: EMBEDDING_CATALOG.bedrockId,
  };
}

/**
 * The platform's own routes, keyed by environment variables, never the database. ORDER IS THE PREFERENCE ORDER within
 * a need after filtering: a standard-retention workspace gets OpenRouter for language and Cohere for embeddings; a
 * zero-retention workspace gets `platform-bedrock`, the only route the retention filter leaves.
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
  {
    routeId: 'platform-bedrock',
    credentialType: PLATFORM_CREDENTIAL_TYPES.BEDROCK,
    serves: ['language', 'embedding'],
    retention: 'ZDR',
    promptCache: 'bedrock',
    // The region is the switch: unset (a developer machine), a zero-retention workspace correctly fails closed.
    isConfigured: (config) => !!config.platformBedrockRegion,
    // The task's own credentials through the default AWS chain (the ECS task role on a deployed task). The Bedrock
    // provider alone reads only the AWS_ACCESS_KEY_ID pair from the environment, which a task role does not set.
    buildProvider: (config) =>
      bedrockBundle(config.platformBedrockRegion ?? '', fromNodeProviderChain(), 'platform-bedrock'),
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
      },
    });
  },
};

/** The credential fields a registry entry may read to build its provider. */
export type BuildableCredential = Pick<AiCredential, 'type' | 'publicId'> &
  Partial<Pick<AiCredential, 'roleArn' | 'externalId' | 'awsRegion'>>;

/** Deployment facts a workspace credential's provider needs beyond its own row. */
export interface TenantBuildContext {
  /** `PROJECT_NAME`, slugged (`aws-role-naming.ts`): the start of a Bedrock role's STS session name. */
  projectSlug: string;
}

/** What a workspace credential type is: what it serves, its retention, its cache strategy, and how to build it. */
export interface TenantCapability {
  serves: readonly AiNeed[];
  promptCache: PromptCacheStrategy;
  /** Retention is per row: an Anthropic key is zero-retention only when its owner attested to it. */
  retention: (credential: Pick<AiCredential, 'zdrAttested'>) => RetentionClass;
  /** `secret` is the decrypted key, or null for a type that stores none. */
  buildProvider: (
    credential: BuildableCredential,
    secret: string | null,
    context?: TenantBuildContext,
  ) => ProviderBundle;
}

/** One hour: the life of a workspace role session. The provider refreshes it before it expires. */
export const BEDROCK_ROLE_SESSION_SECONDS = 3600;

/**
 * The STS `AssumeRole` options for a workspace's Bedrock role. No `masterCredentials`: the role is assumed with the
 * backend's own ambient credentials (the task role), which is exactly the principal the tenant's trust policy names
 * (`PLATFORM_ASSUME_ROLE_ARN`). A row missing its role fields is a failing credential, never served elsewhere.
 */
export function bedrockRoleCredentialOptions(credential: BuildableCredential, sessionName: string) {
  const { roleArn, externalId, awsRegion } = credential;
  if (!roleArn || !externalId || !awsRegion) throw new AiCredentialFailing('language');
  return {
    params: {
      RoleArn: roleArn,
      ExternalId: externalId,
      RoleSessionName: sessionName,
      DurationSeconds: BEDROCK_ROLE_SESSION_SECONDS,
    },
    clientConfig: { region: awsRegion },
  };
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
  // A workspace's own AWS account, through a cross-account role it trusts us to assume with an external id. No secret
  // is stored: temporary credentials come from STS per session (one hour) and refresh themselves.
  [AiCredentialType.BEDROCK_ROLE]: {
    serves: ['language', 'embedding'],
    promptCache: 'bedrock',
    retention: () => 'ZDR',
    buildProvider: (credential, _secret, context) => {
      const sessionName = bedrockSessionName(context?.projectSlug ?? FALLBACK_PROJECT_SLUG, credential.publicId);
      const options = bedrockRoleCredentialOptions(credential, sessionName);
      return bedrockBundle(options.clientConfig.region, fromTemporaryCredentials(options), credential.publicId);
    },
  },
};
