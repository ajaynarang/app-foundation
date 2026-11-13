import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The token counts the AI ledger records, read from an AI SDK or Mastra result. The one reader for the chat stream
 * (Mastra) and for structured output (`generateText`), so every caller records cache reads and cache writes the same
 * way, on every route: it reads the Anthropic, OpenRouter and Bedrock usage shapes.
 *
 * `promptTokens` INCLUDES the cache-read and cache-written tokens (the ledger's meaning; `computeCost` splits them).
 * A cache count is the first positive value among the shapes below, else 0 when some shape reported 0, else
 * undefined (the provider said nothing; the ledger stores null).
 */
export interface LedgerTokens {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number | undefined;
  cacheWriteTokens: number | undefined;
}

type Bag = Record<string, unknown>;

export function usageFromAiSdk(result: unknown): LedgerTokens {
  const root = asBag(result);
  const usage = asBag(root.usage ?? root.totalUsage);
  const details = asBag(usage.inputTokenDetails);
  const raw = asBag(usage.raw);
  const rawDetails = asBag(raw.prompt_tokens_details);
  // A multi-step result's root `providerMetadata` is the LAST step's only: sum the steps' own when there are several.
  const metadata = stepMetadata(root);

  const cachedTokens = firstCount(
    usage.cachedInputTokens,
    details.cacheReadTokens,
    sumCounts(metadata, (m) => [
      m.anthropic.cacheReadInputTokens,
      m.anthropicUsage.cache_read_input_tokens,
      m.bedrockUsage.cacheReadInputTokens,
      asBag(m.openRouterUsage.promptTokensDetails).cachedTokens,
    ]),
    rawDetails.cached_tokens,
    usage.cachedPromptTokens,
    usage.cacheReadInputTokens,
    usage.promptTokensCached,
  );
  const cacheWriteTokens = firstCount(
    usage.cacheCreationInputTokens,
    details.cacheWriteTokens,
    sumCounts(metadata, (m) => [
      m.anthropic.cacheCreationInputTokens,
      m.anthropicUsage.cache_creation_input_tokens,
      m.bedrockUsage.cacheWriteInputTokens,
    ]),
    rawDetails.cache_write_tokens,
  );
  const reportedPrompt = count(usage.inputTokens ?? usage.promptTokens) ?? 0;
  return {
    promptTokens: Math.max(reportedPrompt, (cachedTokens ?? 0) + (cacheWriteTokens ?? 0)),
    completionTokens: count(usage.outputTokens ?? usage.completionTokens) ?? 0,
    cachedTokens,
    cacheWriteTokens,
  };
}

interface StepMetadata {
  anthropic: Bag;
  anthropicUsage: Bag;
  bedrockUsage: Bag;
  openRouterUsage: Bag;
}

/** Each step's provider metadata when the result has several steps; otherwise the root's (a single call). */
function stepMetadata(root: Bag): StepMetadata[] {
  const steps = Array.isArray(root.steps) ? root.steps.map(asBag) : [];
  const sources = steps.length > 1 ? steps.map((step) => step.providerMetadata) : [root.providerMetadata];
  return sources.map((source) => {
    const metadata = asBag(source);
    const anthropic = asBag(metadata.anthropic);
    return {
      anthropic,
      anthropicUsage: asBag(anthropic.usage),
      bedrockUsage: asBag(asBag(metadata.bedrock).usage),
      openRouterUsage: asBag(asBag(metadata.openrouter).usage),
    };
  });
}

/** The per-step count (first shape that reports one) summed over the steps; undefined when no step reported any. */
function sumCounts(steps: StepMetadata[], shapes: (step: StepMetadata) => unknown[]): number | undefined {
  const counts = steps.map((step) => firstCount(...shapes(step))).filter((value) => value !== undefined);
  return counts.length === 0 ? undefined : counts.reduce((total, value) => total + value, 0);
}

function asBag(value: unknown): Bag {
  return value !== null && typeof value === 'object' ? (value as Bag) : {};
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function firstCount(...candidates: unknown[]): number | undefined {
  const counts = candidates.map(count).filter((value): value is number => value !== undefined);
  if (counts.length === 0) return undefined;
  return counts.find((value) => value > 0) ?? 0;
}

/**
 * A measurement aid for a developer's machine: with `AI_USAGE_CAPTURE_DIR` set (the `aiUsageCaptureDir` config value,
 * which `configuration.ts` resolves to unset on every deployed task), write the usage shapes a call returned, numbers
 * and provider names only, every other string dropped. That is how the fixtures behind `usageFromAiSdk`'s spec are
 * captured from live calls instead of written by hand. Never throws, and does nothing without a directory.
 */
export function captureUsageShape(label: string, result: unknown, captureDir: string | undefined): void {
  if (!captureDir) return;
  try {
    const root = asBag(result);
    const shape = {
      usage: numbersOnly(root.usage ?? root.totalUsage),
      providerMetadata: numbersOnly(root.providerMetadata),
    };
    mkdirSync(captureDir, { recursive: true });
    const safeLabel = label.replace(/[^a-z0-9-]/gi, '_');
    writeFileSync(join(captureDir, `${safeLabel}-${Date.now()}.json`), JSON.stringify(shape, null, 2));
  } catch {
    // Capture observes a call; it never touches it.
  }
}

/** The upstream names a usage shape may carry; any other string is dropped (it could be prompt or answer text). */
const KEPT_STRINGS = new Set(['Anthropic', 'Amazon Bedrock', 'Google', 'Google Vertex', 'anthropic', 'bedrock']);

function numbersOnly(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return KEPT_STRINGS.has(value) ? value : undefined;
  if (Array.isArray(value)) return undefined;
  if (value === null || typeof value !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    const kept = numbersOnly(inner);
    if (kept !== undefined) out[key] = kept;
  }
  return out;
}
