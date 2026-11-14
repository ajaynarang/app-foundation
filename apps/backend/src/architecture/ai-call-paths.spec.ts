import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * The AI call paths, held as text rules (comments ignored, specs not scanned):
 *
 * 1. A Mastra agent owns no model: every `new Agent({...})` passes `model: perRequestModel`, so each call takes the
 *    model its caller resolved for the tenant (`REQUEST_MODEL_KEY`). A fixed model skips the tenant's route.
 * 2. Prompt caching belongs to the route: `cacheControl` is written only in `domains/ai/routing/prompt-cache.ts`,
 *    which the resolver applies per route. A breakpoint set by hand breaks on a route with another cache shape.
 * 3. A raw AI SDK call (`generateText`, `streamText`, `generateObject`, `streamObject`, `embed`, `embedMany`) outside
 *    `StructuredOutputService` and `EmbeddingService` is listed below with its reason. Those two services write the
 *    ledger row; a raw call writes none, so a new one is a deliberate edit here.
 * 4. Token usage of a model call is read through `usageFromAiSdk` (`telemetry/usage-from-ai-sdk.ts`), which knows each
 *    provider's cache fields and sums a multi-step run. No other file reads `inputTokens`, `outputTokens` or
 *    `cachedInputTokens`, bar the embedding service (an embedding result has its own usage shape).
 * 5. The AI budget is a cap on platform money: every `assertBudget(` call sits behind `payer === 'PLATFORM'`, so a
 *    workspace on its own key is never capped.
 */

const SRC = path.resolve(__dirname, '..');
const rel = (file: string) => path.relative(SRC, file);

const PROMPT_CACHE_FILE = 'domains/ai/routing/prompt-cache.ts';
const LEDGERED_CALLERS = [
  'domains/ai/infrastructure/providers/structured-output.service.ts',
  'domains/ai/infrastructure/providers/embedding.service.ts',
];
const USAGE_READERS = [
  'domains/ai/infrastructure/telemetry/usage-from-ai-sdk.ts',
  'domains/ai/infrastructure/providers/embedding.service.ts',
];
const BUDGET_OWNER = 'domains/ai/infrastructure/telemetry/ai-telemetry.service.ts';

/** Raw AI SDK call sites outside the two ledgered services: file, number of calls, why it is raw. */
const RAW_SDK_CALLS: ReadonlyArray<{ file: string; count: number; reason: string }> = [
  {
    file: 'domains/ai/orchestrator/skill-classifier.service.ts',
    count: 1,
    reason: 'The routing micro-call that picks an agent: tracer-only telemetry, no ledger row, fails to the default.',
  },
  {
    file: 'domains/feedback/feedback.service.ts',
    count: 1,
    reason: 'One category word per feedback message, on the tenant route; no ledger row (debt: move it to extract).',
  },
  {
    file: 'domains/ai/routing/connect/ai-credential-probe.service.ts',
    count: 2,
    reason: 'The one-token test of a key being connected, on that key itself: there is no resolved route yet.',
  },
];

function callArguments(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/** `new Agent(` calls whose options do not pass `model: perRequestModel`. */
export function agentsWithFixedModel(raw: string): number {
  const source = stripComments(raw);
  let count = 0;
  for (const match of source.matchAll(/\bnew\s+Agent\s*\(/g)) {
    const args = callArguments(source, (match.index ?? 0) + match[0].length - 1);
    if (!/\bmodel\s*:\s*perRequestModel\b/.test(args)) count++;
  }
  return count;
}

export function writesCacheControl(raw: string): boolean {
  return /\bcacheControl\b/.test(stripComments(raw));
}

const RAW_CALL = /(?<![\w.])(?:generateText|streamText|generateObject|streamObject|embed|embedMany)\s*\(/g;

export function rawSdkCalls(raw: string): number {
  return (stripComments(raw).match(RAW_CALL) ?? []).length;
}

export function readsTokenUsage(raw: string): boolean {
  return /\.\s*(?:inputTokens|outputTokens|cachedInputTokens)\b/.test(stripComments(raw));
}

/** `assertBudget(` calls with no `payer === 'PLATFORM'` check in the 300 characters before them. */
export function unguardedBudgetChecks(raw: string): number {
  const source = stripComments(raw);
  let count = 0;
  for (const match of source.matchAll(/\.assertBudget\s*\(/g)) {
    const before = source.slice(Math.max(0, (match.index ?? 0) - 300), match.index);
    if (!/\bpayer\s*===\s*['"]PLATFORM['"]/.test(before)) count++;
  }
  return count;
}

describe('AI call paths', () => {
  describe('the detectors', () => {
    it('sees a Mastra agent with a fixed model, and passes one that takes the per-request model', () => {
      expect(agentsWithFixedModel(`new Agent({ id: 'a', model: anthropic('x'), memory })`)).toBe(1);
      expect(agentsWithFixedModel(`new Agent({ id: 'a', instructions: BASE, model: perRequestModel, memory })`)).toBe(
        0,
      );
      expect(agentsWithFixedModel(`// new Agent({ model: fixed })`)).toBe(0);
    });

    it('sees cacheControl in code, not in a comment', () => {
      expect(writesCacheControl(`providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }`)).toBe(true);
      expect(writesCacheControl(`// never set cacheControl by hand`)).toBe(false);
    });

    it('counts raw AI SDK calls, and not a method of the same name or an import', () => {
      expect(rawSdkCalls(`await generateText({ model }); const r = await embedMany({ model, values });`)).toBe(2);
      expect(rawSdkCalls(`import { generateText, embed } from 'ai'; await this.embeddingService.embed(x);`)).toBe(0);
    });

    it('sees a hand read of token usage', () => {
      expect(readsTokenUsage(`const n = result.usage.inputTokens;`)).toBe(true);
      expect(readsTokenUsage(`const usage = usageFromAiSdk(result);`)).toBe(false);
    });

    it('sees a budget check with no payer check before it', () => {
      expect(unguardedBudgetChecks(`await this.aiTelemetry.assertBudget(tenantId);`)).toBe(1);
      expect(
        unguardedBudgetChecks(`if (route.payer === 'PLATFORM') await this.aiTelemetry.assertBudget(tenantId);`),
      ).toBe(0);
    });
  });

  const files = listSourceFiles(SRC).map((file) => ({ file: rel(file), text: fs.readFileSync(file, 'utf8') }));

  it('scans real files (a scan that sees nothing would pass by vacuity)', () => {
    expect(files.some((f) => f.file === PROMPT_CACHE_FILE)).toBe(true);
    expect(files.some((f) => agentsWithFixedModel(f.text) === 0 && /\bnew\s+Agent\s*\(/.test(f.text))).toBe(true);
  });

  it('every Mastra agent takes the per-request model', () => {
    expect(files.filter((f) => agentsWithFixedModel(f.text) > 0).map((f) => f.file)).toEqual([]);
  });

  it('cacheControl is written only by the route prompt-cache wrapper', () => {
    expect(files.filter((f) => f.file !== PROMPT_CACHE_FILE && writesCacheControl(f.text)).map((f) => f.file)).toEqual(
      [],
    );
  });

  it('every raw AI SDK call outside the ledgered services is listed, with its count and reason', () => {
    const found = files
      .filter((f) => !LEDGERED_CALLERS.includes(f.file))
      .map((f) => ({ file: f.file, count: rawSdkCalls(f.text) }))
      .filter((f) => f.count > 0);
    expect(found.sort((a, b) => a.file.localeCompare(b.file))).toEqual(
      RAW_SDK_CALLS.map(({ file, count }) => ({ file, count })).sort((a, b) => a.file.localeCompare(b.file)),
    );
    for (const entry of RAW_SDK_CALLS) expect(entry.reason.length).toBeGreaterThan(20);
  });

  it('token usage is read only through usageFromAiSdk', () => {
    expect(files.filter((f) => !USAGE_READERS.includes(f.file) && readsTokenUsage(f.text)).map((f) => f.file)).toEqual(
      [],
    );
  });

  it('every budget check is behind a platform-payer check', () => {
    expect(
      files.filter((f) => f.file !== BUDGET_OWNER && unguardedBudgetChecks(f.text) > 0).map((f) => f.file),
    ).toEqual([]);
  });
});
