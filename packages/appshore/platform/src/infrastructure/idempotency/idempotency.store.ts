import { ConflictException, HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ApiErrorCode } from '@app/shared-types';
import { fieldError } from '@appshore/kernel/shared/errors/api-errors';
import { AppCacheService } from '../cache/app-cache.service';

/**
 * Retry-safe creates (ADR "API contract", section 5; held by `idempotency.spec.ts`). A client (a browser, the mobile
 * app or an agent) sends an optional `Idempotency-Key`; the first request with that key in its scope runs, and its
 * success is remembered for 24 hours. A retry with the same key and the same request gets that response back instead
 * of a second record. The same key on a DIFFERENT request (another route or tool, another body) is a 409
 * `IDEMPOTENCY_KEY_REUSED`; a retry that arrives while the first is still running is a 409 `IDEMPOTENCY_KEY_IN_USE`.
 *
 * Storage is Redis with a TTL, not a table: a record lives exactly 24 hours, so the expiry is the sweeper; `SET NX` is
 * the atomic claim across replicas; there is nothing to migrate. Only successes are stored (a failed attempt releases
 * its key so the client can retry it), and only bodies up to {@link IDEMPOTENCY_MAX_BODY_BYTES}. The scope is the
 * caller's (tenant and principal): a key replays only to the principal that sent it, never to a colleague.
 */

/** The HTTP header (IETF draft-ietf-httpapi-idempotency-key-header) that carries the key. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
/** Set on a replayed response. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

/** How long a completed request is replayed: 24 hours. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * How long an in-flight claim blocks a retry if its process dies before finishing: longer than any create runs, so a
 * slow first attempt is never run twice.
 */
export const IDEMPOTENCY_IN_FLIGHT_TTL_MS = 10 * 60 * 1000;
/** A larger body is not remembered (the key is released): replay is for records, not documents. */
export const IDEMPOTENCY_MAX_BODY_BYTES = 256 * 1024;

/** A usable key: 1–255 visible ASCII characters (a UUID is ideal). */
export const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

/** What one request is: where it went and a hash of what it sent. Equal fingerprints replay; different ones 409. */
export interface IdempotencyFingerprint {
  /** `POST /api/v1/things` for a route; `tool:<name>` for an agent tool call. */
  target: string;
  /** sha256 of the canonical request (body and query, or tool arguments). */
  hash: string;
}

/** A remembered success. */
export interface IdempotentResult {
  status: number;
  body: unknown;
}

type StoredRecord = IdempotencyFingerprint &
  ({ state: 'pending'; owner: string } | ({ state: 'done' } & IdempotentResult));

/** `run`: this caller goes ahead and must `complete` or `release`; `replay`: answer with the remembered result. */
export type IdempotencyClaim =
  | { kind: 'run'; complete: (result: IdempotentResult) => Promise<void>; release: () => Promise<void> }
  | { kind: 'replay'; result: IdempotentResult };

/** JSON with sorted object keys at every depth: the same request always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function requestFingerprint(target: string, request: unknown): IdempotencyFingerprint {
  return { target, hash: createHash('sha256').update(canonicalJson(request)).digest('hex') };
}

/** A usable key, or the 400 naming it (`fieldName` is the header, or a tool argument). */
export function assertIdempotencyKey(key: string, fieldName: string = IDEMPOTENCY_KEY_HEADER): void {
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw fieldError(fieldName, `${fieldName} must be 1–255 visible ASCII characters (a UUID is ideal)`);
  }
}

/**
 * How long a store call may take before the caller goes on without it. The app's Redis client queues a command while
 * Redis is unreachable and never rejects it, so without this bound an outage would stall every keyed create.
 */
export const IDEMPOTENCY_STORE_TIMEOUT_MS = 2000;

/** `work`'s value, or `undefined` once {@link IDEMPOTENCY_STORE_TIMEOUT_MS} passes first. Its rejection still rejects. */
export async function withinStoreTimeout<T>(work: Promise<T>): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>(
    (resolve) => (timer = setTimeout(() => resolve(undefined), IDEMPOTENCY_STORE_TIMEOUT_MS)),
  );
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The one fail-open claim, shared by the HTTP interceptor and the tool executor: the claim, or null (run without the
 * key) when the store fails or does not answer in time. A 4xx from the store (409 reuse or in use, 400 bad key)
 * stands and is thrown.
 */
export async function claimOrSkip(
  store: Pick<IdempotencyStore, 'claim'>,
  scope: string,
  key: string,
  fingerprint: IdempotencyFingerprint,
  logger: Pick<Logger, 'warn'>,
): Promise<IdempotencyClaim | null> {
  try {
    const claim = await withinStoreTimeout(store.claim(scope, key, fingerprint));
    if (!claim)
      logger.warn(`Idempotency store did not answer in time for ${fingerprint.target}: running without the key`);
    return claim ?? null;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    logger.warn(
      `Idempotency store unavailable for ${fingerprint.target}, running without the key: ${(error as Error).message}`,
    );
    return null;
  }
}

@Injectable()
export class IdempotencyStore {
  private readonly logger = new Logger(IdempotencyStore.name);

  constructor(private readonly cache: AppCacheService) {}

  /**
   * Claim `key` for this request in `scope` (tenant and principal). Returns the remembered result to replay, or a
   * claim the caller must `complete` (success) or `release` (failure). Throws 409 when the key belongs to a different
   * request or the first attempt is still running, and 400 for an unusable key.
   */
  async claim(scope: string, key: string, fingerprint: IdempotencyFingerprint, attempt = 0): Promise<IdempotencyClaim> {
    assertIdempotencyKey(key);
    const cacheKey = this.cacheKey(scope, key);
    const owner = randomUUID();
    const pending: StoredRecord = { ...fingerprint, state: 'pending', owner };

    if (!(await this.cache.claim(cacheKey, pending, IDEMPOTENCY_IN_FLIGHT_TTL_MS))) {
      const existing = await this.cache.get<StoredRecord>(cacheKey);
      // Expired between the two reads: claim again, once.
      if (!existing && attempt === 0) return this.claim(scope, key, fingerprint, 1);
      if (!existing) throw this.inUse();
      if (existing.target !== fingerprint.target || existing.hash !== fingerprint.hash) {
        throw new ConflictException({
          code: ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
          detail: 'This Idempotency-Key was already used for a different request. Send a new key for a new request.',
        });
      }
      if (existing.state === 'pending') throw this.inUse();
      return { kind: 'replay', result: { status: existing.status, body: existing.body } };
    }

    // Only this attempt's own claim is completed or released, never one a later retry took over after expiry.
    const stillOurs = async () => {
      const current = await this.cache.get<StoredRecord>(cacheKey);
      return current?.state === 'pending' && current.owner === owner;
    };
    const release = async () => {
      if (await stillOurs()) await this.cache.del(cacheKey);
    };
    return {
      kind: 'run',
      release,
      complete: async (result) => {
        if (JSON.stringify(result.body ?? null).length > IDEMPOTENCY_MAX_BODY_BYTES) {
          this.logger.warn(`Idempotency: ${fingerprint.target} answered more than 256 KB, not remembered`);
          return release();
        }
        if (await stillOurs()) {
          await this.cache.set<StoredRecord>(
            cacheKey,
            { ...fingerprint, state: 'done', ...result },
            IDEMPOTENCY_TTL_MS,
          );
        }
      },
    };
  }

  private inUse(): ConflictException {
    return new ConflictException({
      code: ApiErrorCode.IDEMPOTENCY_KEY_IN_USE,
      detail: 'A request with this Idempotency-Key is still being processed. Retry in a moment.',
    });
  }

  /** Per scope; the client's key is hashed so its length and characters never shape the Redis key. */
  private cacheKey(scope: string, key: string): string {
    return `app:idempotency:${scope}:${createHash('sha256').update(key).digest('hex')}`;
  }
}
