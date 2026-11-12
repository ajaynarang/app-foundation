/**
 * Live check of the model catalog on each route family. It spends real money, so it runs only by hand, and each leg
 * runs only when its key is set; a leg without its key prints "skipped". With no key at all it exits 0.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... OPENROUTER_API_KEY=... COHERE_API_KEY=... pnpm --filter @app/backend ai:live-check
 *
 * Legs:
 * - anthropic (`ANTHROPIC_API_KEY`): per alias, through `aiDirect` (the tuned direct-Anthropic models, so effort is
 *   set from the catalog), one plain call and one structured-output call.
 * - openrouter (`OPENROUTER_API_KEY`): per alias, through the `platform-openrouter` registry entry (the catalog's
 *   `openrouterId` slug), one plain call and one structured-output call, with the alias's effort sent as OpenRouter's
 *   `reasoning.effort`. This is what confirms the three 5.5 slugs on OpenRouter.
 * - cohere (`COHERE_API_KEY`): one query embedding through the `platform-cohere` registry entry, which must come back
 *   at the catalog's 1536 dimensions.
 *
 * Every language call runs at the smallest output ceiling (`OUTPUT_CEILINGS.WORD`). A call passes when it answers
 * (finish reason `stop`, non-empty text or a schema-valid object). Any failure exits 1. Paste the printed lines into
 * the pull request.
 */
import { embed, generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import { MODEL_ALIASES, type ModelAlias } from '@app/shared-types';

import { aiDirect } from '../src/domains/ai/infrastructure/providers/ai-provider';
import { EMBEDDING_CATALOG, MODEL_CATALOG } from '../src/domains/ai/routing/model-catalog';
import { OUTPUT_CEILINGS } from '../src/domains/ai/routing/output-ceilings';
import { effortProviderOptions } from '../src/domains/ai/routing/model-tuning.middleware';
import { PLATFORM_ROUTES, type PlatformRoute } from '../src/domains/ai/routing/route-registry';

export const CEILING = OUTPUT_CEILINGS.WORD;
const TIMEOUT_MS = 60_000;

type LegName = 'anthropic' | 'openrouter' | 'cohere';

export interface CheckLine {
  leg: LegName;
  subject: string;
  kind: 'plain' | 'structured' | 'embedding';
  ok: boolean;
  detail: string;
}

type ProviderOptions = Parameters<typeof generateText>[0]['providerOptions'];

/**
 * How the OpenRouter route family takes the alias's effort: OpenRouter's `reasoning.effort`, from the same helper the
 * route resolver's tuning uses, so the live check proves the shape production sends.
 */
export function openRouterEffortOptions(alias: ModelAlias): ProviderOptions {
  return effortProviderOptions('openrouter', alias) as ProviderOptions;
}

function platformRoute(id: PlatformRoute['routeId']): PlatformRoute {
  const route = PLATFORM_ROUTES.find((r) => r.routeId === id);
  if (!route) throw new Error(`route ${id} is not registered`);
  return route;
}

async function plain(
  leg: LegName,
  alias: ModelAlias,
  model: LanguageModel,
  providerOptions?: ProviderOptions,
): Promise<CheckLine> {
  const result = await generateText({
    model,
    prompt: 'Reply with the single word: ready',
    maxOutputTokens: CEILING,
    providerOptions,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    leg,
    subject: alias,
    kind: 'plain',
    ok: result.finishReason === 'stop' && result.text.trim().length > 0,
    detail: `model=${result.response.modelId} finish=${result.finishReason} out=${result.usage.outputTokens} text=${JSON.stringify(result.text.trim().slice(0, 40))}`,
  };
}

async function structured(
  leg: LegName,
  alias: ModelAlias,
  model: LanguageModel,
  providerOptions?: ProviderOptions,
): Promise<CheckLine> {
  const schema = z.object({ verdict: z.enum(['yes', 'no']) });
  // Cast: Output.object with a zod schema trips TS2589 (excessively deep instantiation), as in StructuredOutputService.
  const result: any = await (generateText as any)({
    model,
    system: 'Answer the question.',
    prompt: 'Is 7 a prime number?',
    output: (Output as any).object({ schema }),
    maxOutputTokens: CEILING,
    providerOptions,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    leg,
    subject: alias,
    kind: 'structured',
    ok: schema.safeParse(result.output).success,
    detail: `model=${result.response?.modelId} finish=${result.finishReason} out=${result.usage?.outputTokens} output=${JSON.stringify(result.output)}`,
  };
}

async function languageLeg(
  leg: LegName,
  modelFor: (alias: ModelAlias) => LanguageModel,
  optionsFor: (alias: ModelAlias) => ProviderOptions | undefined,
): Promise<CheckLine[]> {
  const lines: CheckLine[] = [];
  for (const alias of MODEL_ALIASES) {
    for (const [kind, check] of [
      ['plain', plain],
      ['structured', structured],
    ] as const) {
      try {
        lines.push(await check(leg, alias, modelFor(alias), optionsFor(alias)));
      } catch (err) {
        lines.push({ leg, subject: alias, kind, ok: false, detail: String(err) });
      }
    }
  }
  return lines;
}

async function cohereLeg(apiKey: string): Promise<CheckLine[]> {
  const bundle = platformRoute('platform-cohere').buildProvider({ cohereApiKey: apiKey });
  const subject = bundle.embeddingModelId ?? 'embedding';
  try {
    const result = await embed({
      model: bundle.embeddingModel!(),
      value: 'ready',
      providerOptions: {
        cohere: { inputType: 'search_query', outputDimension: EMBEDDING_CATALOG.dimensions },
      },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return [
      {
        leg: 'cohere',
        subject,
        kind: 'embedding',
        ok: result.embedding.length === EMBEDDING_CATALOG.dimensions,
        detail: `dimensions=${result.embedding.length} tokens=${result.usage?.tokens}`,
      },
    ];
  } catch (err) {
    return [{ leg: 'cohere', subject, kind: 'embedding', ok: false, detail: String(err) }];
  }
}

/** Runs every leg whose key is set in `env`. Returns the result lines and the legs skipped for a missing key. */
export async function runLiveChecks(
  env: Record<string, string | undefined>,
): Promise<{ lines: CheckLine[]; skipped: string[] }> {
  const lines: CheckLine[] = [];
  const skipped: string[] = [];

  if (env.ANTHROPIC_API_KEY) {
    // `aiDirect` reads the key from the process environment (the old provider, retired once callers use the resolver).
    lines.push(...(await languageLeg('anthropic', aiDirect, () => undefined)));
  } else skipped.push('anthropic (ANTHROPIC_API_KEY is not set)');

  if (env.OPENROUTER_API_KEY) {
    const bundle = platformRoute('platform-openrouter').buildProvider({ openRouterApiKey: env.OPENROUTER_API_KEY });
    lines.push(...(await languageLeg('openrouter', (alias) => bundle.languageModel!(alias), openRouterEffortOptions)));
  } else skipped.push('openrouter (OPENROUTER_API_KEY is not set)');

  if (env.COHERE_API_KEY) lines.push(...(await cohereLeg(env.COHERE_API_KEY)));
  else skipped.push('cohere (COHERE_API_KEY is not set)');

  return { lines, skipped };
}

function describe(line: CheckLine): string {
  if (line.kind === 'embedding') return `${line.leg} ${line.subject}`;
  const entry = MODEL_CATALOG[line.subject as ModelAlias];
  const id = line.leg === 'openrouter' ? entry.openrouterId : entry.anthropicId;
  return `${line.leg} ${line.subject} (${id}, effort ${entry.effort}, ceiling ${CEILING})`;
}

async function main(): Promise<void> {
  const { lines, skipped } = await runLiveChecks(process.env);
  for (const leg of skipped) console.log(`skipped ${leg}`);
  for (const line of lines) console.log(`${line.ok ? 'PASS' : 'FAIL'} ${describe(line)} ${line.kind}: ${line.detail}`);
  if (lines.length === 0) {
    console.log('ai-live-check: skipped (no provider key is set)');
    return;
  }
  const failed = lines.filter((l) => !l.ok).length;
  console.log(`ai-live-check: ${failed === 0 ? 'PASS' : `FAIL (${failed} of ${lines.length})`}`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) void main();
