/**
 * The embedding A/B gate: are Cohere Embed v4 vectors from Cohere direct (`platform-cohere`, the standard route) and
 * from Bedrock (`platform-bedrock` and a workspace's own role, the zero-retention routes) interchangeable? The
 * knowledge base and Desk memory hold vectors from whichever route served each call, so mixing them is sound only if
 * the two legs give near-identical vectors for the same text. This embeds a fixed corpus of about 100 texts through
 * both legs and passes when the lowest pairwise cosine similarity is at least 0.99.
 *
 * It spends money and needs AWS credentials, so a person runs it, never CI. Run it before setting
 * `PLATFORM_BEDROCK_REGION` in an environment that also has `COHERE_API_KEY`:
 *
 *   COHERE_API_KEY=... PLATFORM_BEDROCK_REGION=us-east-1 AWS_PROFILE=... pnpm --filter @app/backend ai:ab-gate
 *
 * Exit codes: 0 pass; 1 a measured divergence (make Bedrock the only embedding route by unsetting `COHERE_API_KEY`,
 * and record it in the routing ADR); 2 not run (a key is missing: never a pass); 3 errored (a leg threw: credentials,
 * network, quota; not a divergence result).
 */
import { cosineSimilarity, embedMany } from 'ai';
import { EMBEDDING_CATALOG } from '../src/domains/ai/routing/model-catalog';
import { PLATFORM_ROUTES, type PlatformRouteConfig } from '../src/domains/ai/routing/route-registry';

export const PASS_THRESHOLD = 0.99;
const BATCH = 25;

export const EXIT = { PASS: 0, DIVERGED: 1, NOT_RUN: 2, ERRORED: 3 } as const;

/** A fixed, neutral corpus: short and long, several languages, code and numbers. No randomness. */
export const CORPUS: readonly string[] = [
  'The quarterly report is due on the last working day of the month.',
  'Reset your password from the sign-in page; the link expires after one hour.',
  'Invoices are sent by email and can be downloaded from the billing page.',
  'A workspace owner can invite members and change their roles at any time.',
  'The service retries a failed webhook delivery with exponential backoff.',
  'Export the table as CSV, then open it in any spreadsheet tool.',
  'Two-factor authentication adds a one-time code to every sign-in.',
  'function total(items: number[]): number { return items.reduce((a, b) => a + b, 0); }',
  'SELECT id, created_at FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT 20;',
  'Die Lieferung erfolgt innerhalb von drei Werktagen nach Zahlungseingang.',
  'La reunión se ha trasladado al jueves a las diez de la mañana.',
  'この設定は管理者のみが変更できます。',
  'Le fichier joint contient le contrat signé et ses annexes.',
  'Temperature readings above 42 °C trigger an alert to the on-call engineer.',
  'Keep the receipt; refunds need the order number and the original payment method.',
  ...Array.from({ length: 85 }, (_, ix) => {
    const n = ix + 1;
    return (
      `Note ${100 + n}: step ${1 + (n % 5)} of the checklist needs sign-off from reviewer ${n % 17} ` +
      `within ${24 + (n % 72)} hours. ${'Keep the audit trail complete. '.repeat(1 + (n % 4))}`
    );
  }),
];

export interface GateResult {
  exitCode: (typeof EXIT)[keyof typeof EXIT];
  lines: string[];
  min?: number;
}

async function embedLeg(routeId: string, config: PlatformRouteConfig, texts: readonly string[]): Promise<number[][]> {
  const route = PLATFORM_ROUTES.find((r) => r.routeId === routeId);
  if (!route) throw new Error(`route ${routeId} is not registered`);
  const model = route.buildProvider(config).embeddingModel?.();
  if (!model) throw new Error(`route ${routeId} has no embedding model`);
  const options = { inputType: 'search_document' as const, outputDimension: EMBEDDING_CATALOG.dimensions };
  const out: number[][] = [];
  for (let ix = 0; ix < texts.length; ix += BATCH) {
    const { embeddings } = await embedMany({
      model,
      values: texts.slice(ix, ix + BATCH),
      providerOptions: { cohere: options, bedrock: options },
    });
    for (const vector of embeddings) {
      if (vector.length !== EMBEDDING_CATALOG.dimensions) {
        throw new Error(`${routeId} returned ${vector.length} dimensions, not ${EMBEDDING_CATALOG.dimensions}`);
      }
    }
    out.push(...embeddings);
  }
  return out;
}

/** Runs the gate against `env`. Never throws: every outcome is an exit code and printable lines. */
export async function runAbGate(env: Record<string, string | undefined>): Promise<GateResult> {
  const missing: string[] = [];
  if (!env.COHERE_API_KEY) missing.push('COHERE_API_KEY');
  if (!env.PLATFORM_BEDROCK_REGION) missing.push('PLATFORM_BEDROCK_REGION (and AWS credentials)');
  if (missing.length) {
    return {
      exitCode: EXIT.NOT_RUN,
      lines: [`ai-ab-gate: NOT RUN (missing ${missing.join(', ')}). This is not a pass.`],
    };
  }

  const config: PlatformRouteConfig = {
    cohereApiKey: env.COHERE_API_KEY,
    platformBedrockRegion: env.PLATFORM_BEDROCK_REGION,
  };
  let cohere: number[][];
  let bedrock: number[][];
  try {
    cohere = await embedLeg('platform-cohere', config, CORPUS);
    bedrock = await embedLeg('platform-bedrock', config, CORPUS);
  } catch (err) {
    return {
      exitCode: EXIT.ERRORED,
      lines: [`ai-ab-gate: ERRORED, not a divergence result. Fix it and run again: ${String(err)}`],
    };
  }

  const similarities = CORPUS.map((_, ix) => cosineSimilarity(cohere[ix], bedrock[ix]));
  const sorted = [...similarities].sort((a, b) => a - b);
  const min = sorted[0];
  const mean = similarities.reduce((sum, v) => sum + v, 0) / similarities.length;
  const lines = [
    `ai-ab-gate: ${CORPUS.length} texts, min=${min.toFixed(6)} p5=${sorted[Math.floor(sorted.length * 0.05)].toFixed(6)} mean=${mean.toFixed(6)} (pass at min >= ${PASS_THRESHOLD})`,
  ];
  if (min >= PASS_THRESHOLD) {
    lines.push('ai-ab-gate: PASS. The two legs are interchangeable; both may serve embeddings.');
    return { exitCode: EXIT.PASS, lines, min };
  }
  const worst = similarities
    .map((sim, ix) => ({ sim, text: CORPUS[ix] }))
    .sort((a, b) => a.sim - b.sim)
    .slice(0, 5);
  for (const { sim, text } of worst) lines.push(`  ${sim.toFixed(6)}  ${text.slice(0, 80)}`);
  lines.push(
    'ai-ab-gate: FAIL. Make Bedrock the only embedding route (unset COHERE_API_KEY) and record it in the routing ADR.',
  );
  return { exitCode: EXIT.DIVERGED, lines, min };
}

async function main(): Promise<void> {
  const result = await runAbGate(process.env);
  for (const line of result.lines) console.log(line);
  process.exitCode = result.exitCode;
}

if (require.main === module) void main();
