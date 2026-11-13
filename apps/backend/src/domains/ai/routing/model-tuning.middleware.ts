import { Logger } from '@nestjs/common';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { MODEL_ALIASES, type ModelAlias } from '@app/shared-types';
import { MODEL_CATALOG } from './model-catalog';

/** A provider language model, the shape `wrapLanguageModel` takes and returns. */
export type ProviderModel = Parameters<typeof wrapLanguageModel>[0]['model'];

/**
 * How a route family takes the model's effort. The direct Anthropic API reads `anthropic.effort`; OpenRouter reads
 * `reasoning.effort` from its own options key (it spreads `providerOptions.openrouter` into the request body); the
 * Bedrock provider reads `reasoningConfig.maxReasoningEffort` and sends it to a Claude model as `output_config.effort`.
 */
export type EffortFamily = 'anthropic' | 'openrouter' | 'bedrock';

const logger = new Logger('ModelTuning');

/** The provider options that carry `alias`'s effort on a route family. */
export function effortProviderOptions(
  family: EffortFamily,
  alias: ModelAlias,
): Record<string, Record<string, unknown>> {
  const effort = MODEL_CATALOG[alias].effort;
  switch (family) {
    case 'openrouter':
      return { openrouter: { reasoning: { effort } } };
    case 'bedrock':
      return { bedrock: { reasoningConfig: { maxReasoningEffort: effort } } };
    case 'anthropic':
      return { anthropic: { effort } };
  }
}

/**
 * Per-alias request tuning for the Claude 5.5 models:
 * - adds the alias's `effort` (from the model catalog) to the route family's provider options. Thinking is always on
 *   for these models and effort is the lever for how much they think.
 * - retries a refused generate call (finish reason `content-filter`) once on the fallback model, the next alias up.
 *   Streams are left alone: a refusal can arrive after text was already sent, so the caller sees the model's own
 *   answer. The model that actually answered is in the result's `response.modelId`; the ledger records it
 *   (`ResolvedRoute.ledgerModelIdFor`).
 */
export function modelTuningMiddleware(opts: {
  alias: ModelAlias;
  fallback?: ProviderModel;
  family?: EffortFamily;
}): LanguageModelMiddleware {
  const tuning = effortProviderOptions(opts.family ?? 'anthropic', opts.alias);
  return {
    specificationVersion: 'v3',
    transformParams: ({ params }) => {
      const providerOptions: Record<string, Record<string, unknown>> = { ...(params.providerOptions ?? {}) };
      for (const [key, value] of Object.entries(tuning)) {
        providerOptions[key] = { ...(providerOptions[key] ?? {}), ...value };
      }
      return Promise.resolve({ ...params, providerOptions: providerOptions as typeof params.providerOptions });
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      const result = await doGenerate();
      if (result.finishReason.unified !== 'content-filter' || !opts.fallback) return result;
      logger.warn(`${opts.alias} model refused a generate call; retrying once on its fallback model`);
      return opts.fallback.doGenerate(params);
    },
  };
}

/** The next alias up, the one a refused call retries on once. `powerful` has none. */
function nextAliasUp(alias: ModelAlias): ModelAlias | undefined {
  return MODEL_ALIASES[MODEL_ALIASES.indexOf(alias) + 1];
}

function tuned(model: ProviderModel, alias: ModelAlias, family: EffortFamily, fallback?: ProviderModel): ProviderModel {
  return wrapLanguageModel({ model, middleware: modelTuningMiddleware({ alias, fallback, family }) });
}

/**
 * `alias`'s model on one route, tuned: its effort in the route family's shape, and one retry of a refused generate
 * call on the next alias up, itself tuned and with no fallback of its own, so a refusal never cascades. When the next
 * alias has no id on this route (`base` throws), the model has no fallback. The resolver applies this to every
 * language model it hands out.
 */
export function tunedLanguageModel(
  base: (alias: ModelAlias) => ProviderModel,
  alias: ModelAlias,
  family: EffortFamily,
): ProviderModel {
  const up = nextAliasUp(alias);
  let fallback: ProviderModel | undefined;
  if (up) {
    try {
      fallback = tuned(base(up), up, family);
    } catch {
      fallback = undefined;
    }
  }
  return tuned(base(alias), alias, family, fallback);
}
