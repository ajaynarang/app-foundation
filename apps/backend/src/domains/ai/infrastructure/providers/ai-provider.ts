import {
  customProvider,
  createGateway,
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelMiddleware,
  type EmbeddingModel,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ModelAlias } from '@app/shared-types';
import { AI_PROVIDER_LABELS, LEGACY_EMBEDDING, MODEL_CATALOG, type AiProviderLabel } from '../../routing/model-catalog';
import { modelTuningMiddleware } from './model-tuning.middleware';

// Pin Anthropic-model traffic to the Anthropic provider only.
// Without this, AI Gateway's default routing falls back to Bedrock/Vertex when
// our Anthropic BYOK key rate-limits — and those fallbacks bill AI Gateway
// credits because we have no Bedrock/Vertex BYOK configured.
const anthropicOnlyMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => ({
    ...params,
    providerOptions: {
      ...(params.providerOptions ?? {}),
      gateway: {
        ...((params.providerOptions as Record<string, unknown> | undefined)?.gateway as
          | Record<string, unknown>
          | undefined),
        only: ['anthropic'],
      },
    },
  }),
};

/**
 * AI Provider Registry
 *
 * Semantic model aliases that abstract away the underlying provider. Model ids live in the model catalog
 * (`domains/ai/routing/model-catalog.ts`), never here. Switch providers via AI_PROVIDER env var:
 *   - "gateway" (default) → Vercel AI Gateway (needs AI_GATEWAY_API_KEY), on the catalog's `openrouterId` slugs
 *   - "anthropic"         → Direct Anthropic SDK (needs ANTHROPIC_API_KEY), on the catalog's `anthropicId` ids
 *
 * Available aliases:
 *   Language models:
 *   - "fast"      → Haiku 5.5  (chat, quick classifications), effort low
 *   - "standard"  → Sonnet 5.5 (document parsing, structured extraction), effort medium
 *   - "powerful"  → Opus 5.5   (complex extraction, fallback for critical tasks), effort medium
 *
 *   Embedding models:
 *   - "embedding" → the catalog's legacy embedding model via the gateway (always uses the gateway)
 *
 * The direct Anthropic models carry the tuning middleware (effort per alias, one retry one alias up on a refused
 * generate call). The gateway mode gets the 5.5 slugs and no tuning; it is removed when routing moves to the
 * per-tenant resolver, which applies the tuning per route.
 *
 * Telemetry:
 *   AI/LLM observability is handled by Mastra's @mastra/langfuse integration.
 *   All AI calls go through Mastra agents — no manual telemetry flags needed.
 *
 * Usage:
 *   import { ai, aiEmbedding } from './ai-provider';
 *   // Models are passed to Mastra Agent constructors in MastraProvider
 *   const { embedding } = await embed({ model: aiEmbedding('embedding'), value: text });
 */

/**
 * Ledger provider label for every language alias on this provider: Anthropic billed the tokens whether the call
 * went direct or through the gateway (pinned to Anthropic above), and the ledger records the catalog's `anthropicId`.
 */
export const LANGUAGE_PROVIDER_LABEL: AiProviderLabel = AI_PROVIDER_LABELS.ANTHROPIC;

/**
 * Model tiers that have a verified zero-data-retention (ZDR) provider route.
 *
 * ⚠️ INTENTIONALLY EMPTY: neither route this provider offers (the Vercel AI Gateway, the direct Anthropic API) is
 * a zero-retention route, so a tenant flagged `aiZeroRetention` is correctly BLOCKED (fail-closed) rather than
 * leaking to a retaining endpoint. The per-tenant route resolver replaces this with the catalog's `zdrCapable` and a
 * zero-retention route.
 */
export const ZDR_ELIGIBLE_TIERS: ReadonlySet<ModelAlias> = new Set<ModelAlias>([]);

type ProviderModel = Parameters<typeof wrapLanguageModel>[0]['model'];

/**
 * Build the three alias models over the direct Anthropic provider, each on its catalog `anthropicId` with its tuning.
 * A refused generate call retries exactly once on the next alias up (fast → standard → powerful): the fallback is a
 * tuned model with no fallback of its own, so a refusal never cascades. Exported for tests.
 */
export function buildAliasModels(base: (modelId: string) => ProviderModel): Record<ModelAlias, ProviderModel> {
  const build = (alias: ModelAlias, fallback?: ProviderModel) =>
    wrapLanguageModel({
      model: base(anthropicIdFor(alias)),
      middleware: modelTuningMiddleware({ alias, fallback }),
    });
  return {
    fast: build('fast', build('standard')),
    standard: build('standard', build('powerful')),
    powerful: build('powerful'),
  };
}

function anthropicIdFor(alias: ModelAlias): string {
  const id = MODEL_CATALOG[alias].anthropicId;
  if (!id) throw new Error(`Model alias "${alias}" has no Anthropic id in the model catalog`);
  return id;
}

function gatewaySlugFor(alias: ModelAlias): string {
  const id = MODEL_CATALOG[alias].openrouterId;
  if (!id) throw new Error(`Model alias "${alias}" has no gateway slug in the model catalog`);
  return id;
}

// Lazy initialization — env vars aren't available at module import time
// because NestJS ConfigModule loads .env.local after imports resolve.
let _provider: ReturnType<typeof customProvider> | null = null;
let _directAnthropicProvider: ReturnType<typeof customProvider> | null = null;

function getProvider() {
  if (_provider) return _provider;

  const aiProvider = process.env.AI_PROVIDER || 'gateway';

  const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
  });

  function createLanguageModels() {
    if (aiProvider === 'anthropic') {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return buildAliasModels((id) => anthropic(id));
    }

    const gatewayModel = (alias: ModelAlias) =>
      wrapLanguageModel({ model: gateway(gatewaySlugFor(alias)), middleware: anthropicOnlyMiddleware });
    return {
      fast: gatewayModel('fast'),
      standard: gatewayModel('standard'),
      powerful: gatewayModel('powerful'),
    };
  }

  function createEmbeddingModels() {
    return {
      embedding: gateway.embeddingModel(LEGACY_EMBEDDING.gatewaySlug),
    };
  }

  _provider = customProvider({
    languageModels: createLanguageModels(),
    embeddingModels: createEmbeddingModels(),
  });

  return _provider;
}

/**
 * Get a language model by semantic alias.
 */
export function ai(alias: 'fast' | 'standard' | 'powerful'): LanguageModel {
  return getProvider().languageModel(alias);
}

/**
 * Get a language model from the direct Anthropic provider (bypasses AI Gateway).
 * Use when the gateway has issues with certain request patterns (e.g., large structured output schemas).
 */
export function aiDirect(alias: ModelAlias): LanguageModel {
  if (!_directAnthropicProvider) {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    _directAnthropicProvider = customProvider({
      languageModels: buildAliasModels((id) => anthropic(id)),
    });
  }
  return _directAnthropicProvider.languageModel(alias);
}

/**
 * Get an embedding model by semantic alias.
 */
export function aiEmbedding(alias: 'embedding'): EmbeddingModel {
  return getProvider().embeddingModel(alias);
}

/**
 * Returns the required env var names for the current provider.
 * AI_GATEWAY_API_KEY is always required (embeddings route through gateway).
 */
export function getRequiredAiEnvVar(): string {
  const aiProvider = process.env.AI_PROVIDER || 'gateway';
  return aiProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'AI_GATEWAY_API_KEY';
}

/**
 * Checks whether the required AI env var is configured.
 */
export function isAiConfigured(): boolean {
  const envVar = getRequiredAiEnvVar();
  return !!process.env[envVar];
}
