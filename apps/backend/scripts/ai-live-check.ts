/**
 * Live check of the model catalog on the direct Anthropic provider. It spends real money, so it runs only by hand
 * and only when `ANTHROPIC_API_KEY` is set; without it, it prints "skipped" and exits 0.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... pnpm --filter @app/backend ai:live-check
 *
 * For each alias (`fast`, `standard`, `powerful`) it makes, through `aiDirect` (the tuned direct-Anthropic models,
 * so effort is set from the catalog):
 *   1. one plain call, and
 *   2. one structured-output call,
 * both at the smallest output ceiling (`OUTPUT_CEILINGS.WORD`). A call passes when it answers (finish reason `stop`,
 * non-empty text or a schema-valid object). Any failure exits 1. Paste the printed lines into the pull request.
 */
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { MODEL_ALIASES, type ModelAlias } from '@app/shared-types';

import { aiDirect } from '../src/domains/ai/infrastructure/providers/ai-provider';
import { MODEL_CATALOG } from '../src/domains/ai/routing/model-catalog';
import { OUTPUT_CEILINGS } from '../src/domains/ai/routing/output-ceilings';

const CEILING = OUTPUT_CEILINGS.WORD;
const TIMEOUT_MS = 60_000;

interface CheckLine {
  alias: ModelAlias;
  kind: 'plain' | 'structured';
  ok: boolean;
  detail: string;
}

async function plain(alias: ModelAlias): Promise<CheckLine> {
  const result = await generateText({
    model: aiDirect(alias),
    prompt: 'Reply with the single word: ready',
    maxOutputTokens: CEILING,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const ok = result.finishReason === 'stop' && result.text.trim().length > 0;
  return {
    alias,
    kind: 'plain',
    ok,
    detail: `model=${result.response.modelId} finish=${result.finishReason} out=${result.usage.outputTokens} text=${JSON.stringify(result.text.trim().slice(0, 40))}`,
  };
}

async function structured(alias: ModelAlias): Promise<CheckLine> {
  const schema = z.object({ verdict: z.enum(['yes', 'no']) });
  // Cast: Output.object with a zod schema trips TS2589 (excessively deep instantiation), as in StructuredOutputService.
  const result: any = await (generateText as any)({
    model: aiDirect(alias),
    system: 'Answer the question.',
    prompt: 'Is 7 a prime number?',
    output: (Output as any).object({ schema }),
    maxOutputTokens: CEILING,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = schema.safeParse(result.output);
  return {
    alias,
    kind: 'structured',
    ok: parsed.success,
    detail: `model=${result.response?.modelId} finish=${result.finishReason} out=${result.usage?.outputTokens} output=${JSON.stringify(result.output)}`,
  };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ai-live-check: skipped (ANTHROPIC_API_KEY is not set)');
    return;
  }
  process.env.AI_PROVIDER = 'anthropic';

  const lines: CheckLine[] = [];
  for (const alias of MODEL_ALIASES) {
    for (const check of [plain, structured]) {
      try {
        lines.push(await check(alias));
      } catch (err) {
        lines.push({ alias, kind: check === plain ? 'plain' : 'structured', ok: false, detail: String(err) });
      }
    }
  }

  for (const line of lines) {
    const entry = MODEL_CATALOG[line.alias];
    console.log(
      `${line.ok ? 'PASS' : 'FAIL'} ${line.alias} (${entry.anthropicId}, effort ${entry.effort}, ceiling ${CEILING}) ${line.kind}: ${line.detail}`,
    );
  }
  const failed = lines.filter((l) => !l.ok).length;
  console.log(`ai-live-check: ${failed === 0 ? 'PASS' : `FAIL (${failed} of ${lines.length})`}`);
  if (failed > 0) process.exitCode = 1;
}

void main();
