/**
 * OpenRouter's key management API (`/api/v1/keys`), called with a management (provisioning) key. The one place that
 * speaks it: the provisioning service and the `ai:subkey-check` live check both go through these functions.
 *
 * Every error message carries the HTTP status or the shape problem only, never a key: neither the management key nor
 * a created runtime key may reach a log line or an error tracker.
 */

export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/api/v1/keys';

/** Each management call gives up after this long; it runs off the request path, but must not hang a hook. */
const REQUEST_TIMEOUT_MS = 15_000;

export class OpenRouterKeysError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Set when a create answered with a hash but no usable key: that key exists at OpenRouter and must be revoked. */
    readonly orphanHash?: string,
  ) {
    super(message);
    this.name = 'OpenRouterKeysError';
  }
}

export interface CreatedOpenRouterKey {
  /** The runtime key. Shown once by OpenRouter; store it encrypted or revoke it. */
  key: string;
  /** OpenRouter's handle for the key: what update and revoke take. Not a secret. */
  hash: string;
}

export interface OpenRouterKeyInfo {
  hash: string;
  limit: number | null;
  limitReset: string | null;
  disabled: boolean;
}

function headers(managementKey: string): Record<string, string> {
  return { Authorization: `Bearer ${managementKey}`, 'Content-Type': 'application/json' };
}

async function call(url: string, init: RequestInit, what: string): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok)
    throw new OpenRouterKeysError(`OpenRouter ${what} failed: HTTP ${response.status}`, response.status);
  return response;
}

/**
 * Creates a runtime key capped at `limitUsd`, reset monthly (`limit_reset: 'monthly'`, midnight UTC on the first). The
 * reset matters: without it the limit is cumulative, and a workspace that hit its cap would stay refused at OpenRouter
 * after its monthly budget reset in the ledger.
 */
export async function createOpenRouterKey(
  managementKey: string,
  input: { name: string; limitUsd: number },
): Promise<CreatedOpenRouterKey> {
  const response = await call(
    OPENROUTER_KEYS_URL,
    {
      method: 'POST',
      headers: headers(managementKey),
      body: JSON.stringify({ name: input.name, limit: input.limitUsd, limit_reset: 'monthly' }),
    },
    'key create',
  );
  const payload = (await response.json()) as { key?: unknown; hash?: unknown; data?: { hash?: unknown } };
  const key = typeof payload.key === 'string' ? payload.key : undefined;
  const rawHash = payload.data?.hash ?? payload.hash;
  const hash = typeof rawHash === 'string' ? rawHash : undefined;
  if (!key || !hash) {
    // A key without a hash cannot be revoked, and a hash without a key cannot be used; either way it is unusable.
    throw new OpenRouterKeysError('OpenRouter key create returned an unexpected shape', undefined, hash);
  }
  return { key, hash };
}

/** Sets a key's monthly limit. */
export async function setOpenRouterKeyLimit(managementKey: string, hash: string, limitUsd: number): Promise<void> {
  await call(
    `${OPENROUTER_KEYS_URL}/${encodeURIComponent(hash)}`,
    {
      method: 'PATCH',
      headers: headers(managementKey),
      body: JSON.stringify({ limit: limitUsd, limit_reset: 'monthly' }),
    },
    'key limit update',
  );
}

/** Deletes a key: it stops working at once. */
export async function revokeOpenRouterKey(managementKey: string, hash: string): Promise<void> {
  await call(
    `${OPENROUTER_KEYS_URL}/${encodeURIComponent(hash)}`,
    { method: 'DELETE', headers: headers(managementKey) },
    'key revoke',
  );
}

/** Reads a key's limit and state (the live check uses it to prove the cap was applied). */
export async function getOpenRouterKey(managementKey: string, hash: string): Promise<OpenRouterKeyInfo> {
  const response = await call(
    `${OPENROUTER_KEYS_URL}/${encodeURIComponent(hash)}`,
    { method: 'GET', headers: headers(managementKey) },
    'key read',
  );
  const payload = (await response.json()) as {
    data?: { hash?: unknown; limit?: unknown; limit_reset?: unknown; disabled?: unknown };
  };
  const data = payload.data ?? {};
  return {
    hash: typeof data.hash === 'string' ? data.hash : hash,
    limit: typeof data.limit === 'number' ? data.limit : null,
    limitReset: typeof data.limit_reset === 'string' ? data.limit_reset : null,
    disabled: data.disabled === true,
  };
}
