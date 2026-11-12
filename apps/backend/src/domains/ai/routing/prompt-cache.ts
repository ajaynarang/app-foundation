import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import type { ProviderModel } from './model-tuning.middleware';

/**
 * How a route caches a prompt. Each registry entry declares one:
 * - `anthropic`: Anthropic's `cacheControl` on the direct API;
 * - `openrouter`: OpenRouter's `cacheControl`, which it passes on to Anthropic;
 * - `bedrock`: Bedrock's `cachePoint`;
 * - `none`: no marker (an embedding route, or a route not yet verified to forward one).
 */
export const PROMPT_CACHE_STRATEGIES = ['anthropic', 'openrouter', 'bedrock', 'none'] as const;
export type PromptCacheStrategy = (typeof PROMPT_CACHE_STRATEGIES)[number];

type ProviderOptions = Record<string, Record<string, unknown>>;

const EPHEMERAL = { type: 'ephemeral' } as const;

/** The provider options that mark one message as a cache breakpoint on a strategy; none for `none`. */
export function cacheBreakpoint(strategy: PromptCacheStrategy): ProviderOptions | undefined {
  switch (strategy) {
    case 'anthropic':
      return { anthropic: { cacheControl: EPHEMERAL } };
    case 'openrouter':
      return { openrouter: { cacheControl: EPHEMERAL } };
    case 'bedrock':
      return { bedrock: { cachePoint: { type: 'default' } } };
    case 'none':
      return undefined;
  }
}

type Prompt = Parameters<NonNullable<LanguageModelMiddleware['transformParams']>>[0]['params']['prompt'];
type PromptMessage = Prompt[number];

function withBreakpoint(message: PromptMessage, marker: ProviderOptions): PromptMessage {
  const options: ProviderOptions = { ...((message.providerOptions as ProviderOptions | undefined) ?? {}) };
  for (const [key, value] of Object.entries(marker)) options[key] = { ...(options[key] ?? {}), ...value };
  return { ...message, providerOptions: options } as PromptMessage;
}

/**
 * Marks prompt-cache breakpoints on the provider request, so repeated prefixes bill at the cache-read rate instead of
 * full input. It acts on the request the provider receives, after Mastra: a mark set on a message before Mastra never
 * reached the request in a sibling product's measurements.
 *
 * - The last system message: tool definitions and instructions, identical on every turn of an agent.
 * - The last message, but only once the prompt holds an assistant turn: in a tool loop or a follow-up turn the next
 *   request extends exactly this prefix. A one-shot extraction has no assistant turn, so its unique input is never
 *   written to cache (a write costs 1.25x input and would never be read back).
 *
 * The provider ignores a breakpoint on a prefix below its minimum cacheable size, so short prompts are unaffected.
 * Never mutates the caller's prompt. `none` adds nothing.
 */
export function promptCacheMiddleware(strategy: PromptCacheStrategy): LanguageModelMiddleware {
  const marker = cacheBreakpoint(strategy);
  return {
    specificationVersion: 'v3',
    transformParams: ({ params }) => {
      if (!marker) return Promise.resolve(params);
      const prompt = [...params.prompt];

      const lastSystemIndex = prompt.map((m) => m.role).lastIndexOf('system');
      if (lastSystemIndex >= 0) prompt[lastSystemIndex] = withBreakpoint(prompt[lastSystemIndex], marker);

      const lastIndex = prompt.length - 1;
      const hasAssistantTurn = prompt.some((m) => m.role === 'assistant');
      if (hasAssistantTurn && lastIndex !== lastSystemIndex) {
        prompt[lastIndex] = withBreakpoint(prompt[lastIndex], marker);
      }

      return Promise.resolve({ ...params, prompt });
    },
  };
}

/** `model` with the strategy's breakpoints, or unchanged for `none`. */
export function withPromptCache(model: ProviderModel, strategy: PromptCacheStrategy): ProviderModel {
  if (strategy === 'none') return model;
  return wrapLanguageModel({ model, middleware: promptCacheMiddleware(strategy) });
}
