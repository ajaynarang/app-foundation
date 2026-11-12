/**
 * Live check of the bring-your-own-key probe: the exact test `POST /ai-settings/credentials` runs before it stores a
 * key, against a real key of each paste-key type. It spends a little real money, so it runs only by hand, and each
 * type runs only when its key is set; with no key at all it exits 0.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... OPENROUTER_API_KEY=... AI_GATEWAY_API_KEY=... pnpm --filter @app/backend ai:probe-check
 *
 * - ANTHROPIC_KEY      reads `ANTHROPIC_API_KEY`
 * - OPENROUTER_KEY     reads `OPENROUTER_API_KEY` (used here as a workspace's own OpenRouter key)
 * - VERCEL_GATEWAY_KEY reads `AI_GATEWAY_API_KEY` (a Vercel AI Gateway key; the app itself no longer reads it)
 *
 * Each line prints PASS or FAIL with the probe's redacted detail and the ceiling it ran at. A type passes when the
 * probe passes. Any failure exits 1. Paste the printed lines into the pull request.
 */
import { AiCredentialType } from '@appshore/db';
import {
  AiCredentialProbeService,
  PROBE_MAX_OUTPUT_TOKENS,
} from '../src/domains/ai/routing/connect/ai-credential-probe.service';

export const PROBE_KEYS: ReadonlyArray<{ type: AiCredentialType; env: string }> = [
  { type: AiCredentialType.ANTHROPIC_KEY, env: 'ANTHROPIC_API_KEY' },
  { type: AiCredentialType.OPENROUTER_KEY, env: 'OPENROUTER_API_KEY' },
  { type: AiCredentialType.VERCEL_GATEWAY_KEY, env: 'AI_GATEWAY_API_KEY' },
];

export interface ProbeLine {
  type: AiCredentialType;
  ok: boolean;
  detail: string;
  latencyMs: number;
}

/** Probes every type whose key is set in `env`. Returns the result lines and the types skipped for a missing key. */
export async function runProbeChecks(
  env: Record<string, string | undefined>,
  probe = new AiCredentialProbeService(),
): Promise<{ lines: ProbeLine[]; skipped: string[] }> {
  const lines: ProbeLine[] = [];
  const skipped: string[] = [];
  for (const { type, env: name } of PROBE_KEYS) {
    const secret = env[name]?.trim();
    if (!secret) {
      skipped.push(`${type} (${name} is not set)`);
      continue;
    }
    const result = await probe.probeKey(type, secret);
    lines.push({ type, ok: result.ok, detail: result.detail, latencyMs: result.latencyMs });
  }
  return { lines, skipped };
}

async function main(): Promise<void> {
  const { lines, skipped } = await runProbeChecks(process.env);
  for (const type of skipped) console.log(`skipped ${type}`);
  for (const line of lines) {
    console.log(
      `${line.ok ? 'PASS' : 'FAIL'} ${line.type} (ceiling ${PROBE_MAX_OUTPUT_TOKENS}, ${line.latencyMs} ms): ${line.detail}`,
    );
  }
  if (lines.length === 0) {
    console.log('ai-probe-check: skipped (no key is set)');
    return;
  }
  const failed = lines.filter((l) => !l.ok).length;
  console.log(`ai-probe-check: ${failed === 0 ? 'PASS' : `FAIL (${failed} of ${lines.length})`}`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) void main();
