/**
 * Live check of per-workspace OpenRouter sub-keys against a real OpenRouter account: create a key with a monthly cap,
 * change the cap, read it back, then revoke it by its hash right after creating it, through the same client the
 * provisioning service uses. That last step is the one the service relies on to clean up a key it could not store.
 *
 * It calls OpenRouter's key management API only, never a model, so it spends nothing; the key it creates is capped at
 * $1 and deleted at the end. It still runs only by hand, and only when the management key is set; with no key it
 * exits 0 and prints "skipped". Use a test OpenRouter account.
 *
 * Usage:
 *   OPENROUTER_PROVISIONING_KEY=... pnpm --filter @app/backend ai:subkey-check
 *
 * Each step prints PASS or FAIL. Any failure exits 1, and when the key could not be revoked its hash is printed so it
 * can be deleted by hand. Paste the printed lines into the pull request. Neither key is ever printed.
 */
import {
  createOpenRouterKey,
  getOpenRouterKey,
  revokeOpenRouterKey,
  setOpenRouterKeyLimit,
} from '../src/domains/ai/routing/provisioning/openrouter-keys.client';

export interface SubKeyCheckLine {
  step: 'create' | 'cap' | 'read' | 'revoke' | 'revoked';
  ok: boolean;
  detail: string;
}

const CREATE_LIMIT_USD = 1;
const UPDATED_LIMIT_USD = 2;

/** Runs the create, cap, read and revoke steps. Returns no lines when the management key is unset. */
export async function runSubKeyCheck(
  env: Record<string, string | undefined>,
  now: () => number = Date.now,
): Promise<{ lines: SubKeyCheckLine[]; skipped: boolean }> {
  const managementKey = env.OPENROUTER_PROVISIONING_KEY?.trim();
  if (!managementKey) return { lines: [], skipped: true };

  const lines: SubKeyCheckLine[] = [];
  let hash: string;
  try {
    const created = await createOpenRouterKey(managementKey, {
      name: `subkey-check-${now()}`,
      limitUsd: CREATE_LIMIT_USD,
    });
    hash = created.hash;
    lines.push({ step: 'create', ok: true, detail: `hash ${hash}, limit $${CREATE_LIMIT_USD}, monthly reset` });
  } catch (err) {
    lines.push({ step: 'create', ok: false, detail: (err as Error).message });
    return { lines, skipped: false };
  }

  try {
    await setOpenRouterKeyLimit(managementKey, hash, UPDATED_LIMIT_USD);
    lines.push({ step: 'cap', ok: true, detail: `limit set to $${UPDATED_LIMIT_USD}` });
  } catch (err) {
    lines.push({ step: 'cap', ok: false, detail: (err as Error).message });
  }

  try {
    const info = await getOpenRouterKey(managementKey, hash);
    const ok = info.limit === UPDATED_LIMIT_USD && info.limitReset === 'monthly';
    lines.push({ step: 'read', ok, detail: `limit ${info.limit ?? 'none'}, reset ${info.limitReset ?? 'none'}` });
  } catch (err) {
    lines.push({ step: 'read', ok: false, detail: (err as Error).message });
  }

  try {
    await revokeOpenRouterKey(managementKey, hash);
    lines.push({ step: 'revoke', ok: true, detail: `deleted ${hash}` });
  } catch (err) {
    lines.push({ step: 'revoke', ok: false, detail: `${(err as Error).message}; delete ${hash} by hand` });
    return { lines, skipped: false };
  }

  // After the delete the key must be gone: a read that still succeeds means the revoke did not take.
  try {
    await getOpenRouterKey(managementKey, hash);
    lines.push({ step: 'revoked', ok: false, detail: `${hash} can still be read after the delete` });
  } catch {
    lines.push({ step: 'revoked', ok: true, detail: `${hash} is gone` });
  }
  return { lines, skipped: false };
}

async function main(): Promise<void> {
  const { lines, skipped } = await runSubKeyCheck(process.env);
  if (skipped) {
    console.log('ai-subkey-check: skipped (OPENROUTER_PROVISIONING_KEY is not set)');
    return;
  }
  for (const line of lines) console.log(`${line.ok ? 'PASS' : 'FAIL'} ${line.step}: ${line.detail}`);
  const failed = lines.filter((l) => !l.ok).length;
  console.log(`ai-subkey-check: ${failed === 0 ? 'PASS' : `FAIL (${failed} of ${lines.length})`}`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) void main();
