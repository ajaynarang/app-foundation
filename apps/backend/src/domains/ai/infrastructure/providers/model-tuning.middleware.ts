import { Logger } from '@nestjs/common';
import type { LanguageModelMiddleware, wrapLanguageModel } from 'ai';
import type { ModelAlias } from '@app/shared-types';
import { MODEL_CATALOG } from '../../routing/model-catalog';

type ProviderModel = Parameters<typeof wrapLanguageModel>[0]['model'];

const logger = new Logger('ModelTuning');

/**
 * Per-alias request tuning for the Claude 5.5 models:
 * - adds the alias's `effort` (from the model catalog) to the route family's provider options. Thinking is always on
 *   for these models and effort is the lever for how much they think. Each route family reads its own key; the
 *   direct Anthropic provider reads `anthropic`, the default.
 * - retries a refused generate call (finish reason `content-filter`) once on the fallback model, the next alias up.
 *   Streams are left alone: a refusal can arrive after text was already sent, so the caller sees the model's own
 *   answer. The model that actually answered is in the result's `response.modelId`; the ledger records it
 *   (`ledgerModelIdFor`).
 */
export function modelTuningMiddleware(opts: {
  alias: ModelAlias;
  fallback?: ProviderModel;
  optionsKey?: string;
}): LanguageModelMiddleware {
  const optionsKey = opts.optionsKey ?? 'anthropic';
  const effort = MODEL_CATALOG[opts.alias].effort;
  return {
    specificationVersion: 'v3',
    transformParams: ({ params }) =>
      Promise.resolve({
        ...params,
        providerOptions: {
          ...(params.providerOptions ?? {}),
          [optionsKey]: { ...(params.providerOptions?.[optionsKey] ?? {}), effort },
        },
      }),
    wrapGenerate: async ({ doGenerate, params }) => {
      const result = await doGenerate();
      if (result.finishReason.unified !== 'content-filter' || !opts.fallback) return result;
      logger.warn(`${opts.alias} model refused a generate call; retrying once on its fallback model`);
      return opts.fallback.doGenerate(params);
    },
  };
}
