import type { ModelAlias } from '@app/shared-types';

/**
 * The model catalog: the one file that names model ids. One row per semantic alias, one column per route family.
 * Bumping a model is a change here plus pricing rows in `packages/appshore/db/prisma/seeds/08-model-pricing.seed.ts`.
 * No other file under `apps/backend/src` may write a model id (held by `architecture/model-id-literals.spec.ts`).
 *
 * Which column a call uses depends on the route:
 * - `anthropicId` on the direct Anthropic API (a tenant Anthropic key).
 * - `openrouterId` on OpenRouter (the platform default and a tenant OpenRouter key), and as the request slug on the
 *   Vercel AI Gateway, which uses the same vendor-prefixed, dotted form (`anthropic/claude-sonnet-5.5`).
 * - `bedrockId` on both Bedrock routes (the platform's zero-retention route and a workspace's own AWS role). The 5.5
 *   models have no in-region on-demand id in US regions, so the column holds the US geo cross-region inference
 *   profile (`us.` prefix), read from AWS's Bedrock model cards. A deployment whose Bedrock region is outside the US
 *   needs that geography's profile (`eu.`, `au.`, `jp.`) instead.
 *
 * No 4.x id is ever written here. A 5.5 id that cannot be confirmed on a route is left unset on that column and the
 * alias is listed in `UNREGISTERED_ALIASES`, so the route refuses that alias instead of serving an older model.
 */

/** How hard the model thinks. Thinking is always on for the 5.5 models; effort is the lever, billed as output. */
export type ModelEffort = 'low' | 'medium' | 'high';

export interface ModelCatalogEntry {
  /** Anthropic direct API model id. */
  anthropicId?: string;
  /** OpenRouter slug; also the Vercel AI Gateway slug. */
  openrouterId?: string;
  /** Amazon Bedrock inference profile id (US geo cross-region), on both Bedrock routes. */
  bedrockId?: string;
  /**
   * Whether the model can be served under zero data retention on some route at all. True for the three 5.5 models:
   * Bedrock's abuse-detection page lists no retention for them (it names only the Fable models and most OpenAI ones),
   * so a Bedrock account set to `data_retention_mode: none` serves them without keeping prompts or outputs.
   */
  zdrCapable: boolean;
  /** Effort sent on every call through this alias (`fast` serves high-volume work, so it runs low). */
  effort: ModelEffort;
  /**
   * Prompt size above which the provider bills a higher rate than the one pricing row the ledger keeps. Set only for
   * a model with such a tier; the telemetry writer warns when a call crosses it, because that row's cost is low.
   */
  longPromptSurchargeAbove?: number;
}

export const MODEL_CATALOG: Record<ModelAlias, ModelCatalogEntry> = {
  fast: {
    anthropicId: 'claude-haiku-5-5',
    openrouterId: 'anthropic/claude-haiku-5.5',
    bedrockId: 'us.anthropic.claude-haiku-5-5',
    zdrCapable: true,
    effort: 'low',
    // Haiku 5.5 bills $0.50 / $2.50 per million above 100K prompt tokens.
    longPromptSurchargeAbove: 100_000,
  },
  standard: {
    anthropicId: 'claude-sonnet-5-5',
    openrouterId: 'anthropic/claude-sonnet-5.5',
    bedrockId: 'us.anthropic.claude-sonnet-5-5',
    zdrCapable: true,
    effort: 'medium',
  },
  powerful: {
    anthropicId: 'claude-opus-5-5',
    openrouterId: 'anthropic/claude-opus-5.5',
    bedrockId: 'us.anthropic.claude-opus-5-5',
    zdrCapable: true,
    effort: 'medium',
  },
};

/** The id columns a route reads. */
export const ROUTE_ID_COLUMNS = ['anthropicId', 'openrouterId', 'bedrockId'] as const;
export type RouteIdColumn = (typeof ROUTE_ID_COLUMNS)[number];

/**
 * Aliases deliberately left without an id on a column, because the 5.5 model could not be confirmed on that route.
 * A route refuses an alias listed here. Empty today: every alias has an id on every column.
 */
export const UNREGISTERED_ALIASES: Partial<Record<RouteIdColumn, readonly ModelAlias[]>> = {};

/**
 * The one embedding model: Cohere Embed v4 at 1536 dimensions, the only model on both a zero-retention route (Bedrock)
 * and a public one (Cohere direct). The dimension is load-bearing: two tables carry `vector(1536)`.
 */
export const EMBEDDING_CATALOG = {
  cohereDirectId: 'embed-v4.0',
  bedrockId: 'cohere.embed-v4:0',
  dimensions: 1536,
} as const;

/** Vendor labels for the cost ledger: who ultimately billed the tokens. `openai` is external moderation only. */
export const AI_PROVIDER_LABELS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  OPENROUTER: 'openrouter',
  AWS: 'aws',
  COHERE: 'cohere',
} as const;
export type AiProviderLabel = (typeof AI_PROVIDER_LABELS)[keyof typeof AI_PROVIDER_LABELS];

/**
 * The model id the ledger records for a call through `alias` on a route that reads `column`. A refused call retries
 * once one alias up, and is then answered (and billed) by that model, so the id the provider reports wins when it is
 * one of ours (on any column): the ledger records that model's id on the route's column. Any other id (an unknown or
 * dated one) would have no pricing row, so the alias's own id is kept.
 */
export function ledgerModelIdFor(
  alias: ModelAlias,
  answeredByModelId: string | undefined,
  column: RouteIdColumn = 'anthropicId',
): string {
  if (answeredByModelId) {
    for (const entry of Object.values(MODEL_CATALOG)) {
      if (ROUTE_ID_COLUMNS.some((c) => entry[c] === answeredByModelId) && entry[column]) {
        return entry[column];
      }
    }
  }
  return MODEL_CATALOG[alias][column] ?? alias;
}

/** The long-prompt threshold of the model behind `modelId` (any route column), when it has one. */
export function longPromptSurchargeAbove(modelId: string): number | undefined {
  for (const entry of Object.values(MODEL_CATALOG)) {
    if (ROUTE_ID_COLUMNS.some((column) => entry[column] === modelId)) return entry.longPromptSurchargeAbove;
  }
  return undefined;
}
