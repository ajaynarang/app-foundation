import { ApiError } from '@appshore/web-core/shared/lib/api/client';

/** A request that does not exist here, or is not this person's to see: retrying will not change it. */
export function isFinalError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}
