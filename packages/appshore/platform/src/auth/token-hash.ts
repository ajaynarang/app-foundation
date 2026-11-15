import { createHash } from 'crypto';

/**
 * The stored form of a one-time secret that is emailed or shared (an invitation token, a password-reset token):
 * sha256 over its UTF-8 bytes, as lowercase hex (64 characters). Only this is written to the database; the raw token
 * lives only in the link. It is the same value as Postgres's `encode(sha256(convert_to(x, 'UTF8')), 'hex')`, which
 * the migration that hashed stored invitation tokens uses, so a link issued before that migration still resolves.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}
