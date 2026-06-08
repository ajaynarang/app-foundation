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
 * Semantic model aliases that abstract away the underlying provider.
 * Switch providers via AI_PROVIDER env var:
 *   - "gateway" (default) → Vercel AI Gateway (needs AI_GATEWAY_API_KEY)
 *   - "anthropic"         → Direct Anthropic SDK (needs ANTHROPIC_API_KEY)
 *
 * Available aliases:
 *   Language models:
 *   - "fast"      → Haiku 4.5  (chat, quick classifications)
 *   - "standard"  → Sonnet 4.6 (document parsing, structured extraction)
 *   - "powerful"  → Opus 4.6   (complex extraction, fallback for critical tasks)
 *
 *   Embedding models:
 *   - "embedding" → text-embedding-3-small via gateway (always uses gateway)
 *
 * Telemetry:
 *   AI/LLM observability is handled by Mastra's @mastra/langfuse integration.
 *   All AI calls go through Mastra agents — no manual telemetry flags needed.
 *
 * Usage:
 *   import { ai, aiEmbedding } from '../../infrastructure/providers/ai-provider';
 *   // Models are passed to Mastra Agent constructors in MastraProvider
 *   const { embedding } = await embed({ model: aiEmbedding('embedding'), value: text });
 */

/**
 * Coarse provider labels used for cost attribution in the AI ledger. These
 * are NOT the same as the `AI_PROVIDER` env switch (gateway vs anthropic) —
 * they identify which vendor ultimately billed the tokens, regardless of
 * whether the call went direct or through the gateway.
 */
export const AI_PROVIDERS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
} as const;
export type AiProviderLabel = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

/**
 * Canonical model id for each language alias. Single source of truth shared
 * by the routing layer (below) and the cost ledger (StructuredOutputService,
 * AlertBriefingService) so a model bump updates one place. The ledger stores
 * the resolved id at write time, preserving the alias→version snapshot for
 * historical cost reconciliation.
 */
export const MODEL_ID_BY_ALIAS: Record<ModelAlias, string> = {
  fast: 'claude-haiku-4-5',
  standard: 'claude-sonnet-4-6',
  powerful: 'claude-opus-4-6',
};

/** Provider label for each language alias — all Anthropic today. */
export const PROVIDER_BY_ALIAS: Record<ModelAlias, AiProviderLabel> = {
  fast: AI_PROVIDERS.ANTHROPIC,
  standard: AI_PROVIDERS.ANTHROPIC,
  powerful: AI_PROVIDERS.ANTHROPIC,
};

/** Canonical embedding model id + provider for the ledger. */
export const EMBEDDING_MODEL_ID = 'text-embedding-3-small';
export const EMBEDDING_PROVIDER_LABEL: AiProviderLabel = AI_PROVIDERS.OPENAI;

/**
 * Model tiers that have a verified zero-data-retention (ZDR) provider route.
 *
 * ⚠️ INTENTIONALLY EMPTY pending the provider decision (AI Cost Telemetry
 * plan, open question #3): which AI Gateway routes are ZDR-eligible? Anthropic
 * via Bedrock/Vertex offers ZDR; the direct API does not. Until that's
 * confirmed and the corresponding gateway route is wired, NO tier is
 * ZDR-eligible — so a tenant flagged `aiZeroRetention` is correctly BLOCKED
 * (fail-closed) rather than leaking to a retaining endpoint.
 *
 * To enable: confirm the ZDR gateway route, add the tier(s) here, and wire
 * the ZDR-specific model in `getProvider()` (likely a providerOptions flag or
 * a separate ZDR gateway instance).
 */
export const ZDR_ELIGIBLE_TIERS: ReadonlySet<ModelAlias> = new Set<ModelAlias>([
  // e.g. 'standard', once an Anthropic-Bedrock ZDR route is configured.
]);

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
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return {
        fast: anthropic('claude-haiku-4-5'),
        standard: anthropic('claude-sonnet-4-6'),
        powerful: anthropic('claude-opus-4-6'),
      };
    }

    return {
      fast: wrapLanguageModel({
        model: gateway('anthropic/claude-haiku-4.5'),
        middleware: anthropicOnlyMiddleware,
      }),
      standard: wrapLanguageModel({
        model: gateway('anthropic/claude-sonnet-4.6'),
        middleware: anthropicOnlyMiddleware,
      }),
      powerful: wrapLanguageModel({
        model: gateway('anthropic/claude-opus-4.6'),
        middleware: anthropicOnlyMiddleware,
      }),
    };
  }

  function createEmbeddingModels() {
    return {
      embedding: gateway.embeddingModel('openai/text-embedding-3-small'),
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
      languageModels: {
        fast: anthropic('claude-haiku-4-5'),
        standard: anthropic('claude-sonnet-4-6'),
        powerful: anthropic('claude-opus-4-6'),
      },
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
