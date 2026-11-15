import { z } from 'zod';
import { IDEMPOTENCY_KEY_PATTERN } from '@appshore/platform/infrastructure/idempotency/idempotency.store';

/**
 * Retry-safe tool creates. An agent that may retry a create (a network blip, a timeout, a re-planned step) passes the
 * same `idempotencyKey` again and gets the first call's result back instead of a second record. A tool opts in by
 * declaring {@link idempotencyKeyArg} in its `parameters` under {@link IDEMPOTENCY_KEY_ARG}; the executor does the
 * rest through the same `IdempotencyStore` the `Idempotency-Key` header uses: 24 hours, per tenant and acting person;
 * the same key with different arguments is `IDEMPOTENCY_KEY_REUSED`; the key itself never reaches the tool. A create
 * with a natural key (a unique name, an external id) does not need it.
 */
export const IDEMPOTENCY_KEY_ARG = 'idempotencyKey';

export const idempotencyKeyArg = z
  .string()
  .regex(IDEMPOTENCY_KEY_PATTERN, 'idempotencyKey must be 1–255 visible ASCII characters (a UUID is ideal)')
  .optional()
  .describe(
    'Optional. A unique key (a UUID) for this create. Retrying with the same key and arguments within 24 hours returns the first result instead of creating a duplicate.',
  );

/** Whether a tool's `parameters` declare {@link IDEMPOTENCY_KEY_ARG}. Only such a tool gets replay protection. */
export function declaresIdempotencyKey(parameters: unknown): boolean {
  const shape = (parameters as { shape?: unknown } | null | undefined)?.shape;
  return !!shape && typeof shape === 'object' && IDEMPOTENCY_KEY_ARG in shape;
}
