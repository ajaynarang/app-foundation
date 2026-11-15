import { createHash } from 'crypto';
import { hashToken } from '../token-hash';

/**
 * Every emailed or shared one-time secret (an invitation token, a reset token) is stored as this hash. The forward
 * migration that hashed the invitation tokens already stored computes it in SQL, so the two must agree byte for byte:
 * `encode(sha256(convert_to(x, 'UTF8')), 'hex')` in Postgres. `user-invitations.integration.spec.ts` runs that SQL.
 */
describe('hashToken', () => {
  it('is sha256 over the UTF-8 bytes, as lowercase hex (known-answer vector)', () => {
    // sha256("abc"), the FIPS 180-2 test vector.
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes the UTF-8 bytes, not a Latin-1 reading of the string', () => {
    const raw = 'tok-é-✓';
    expect(hashToken(raw)).toBe(createHash('sha256').update(Buffer.from(raw, 'utf8')).digest('hex'));
    expect(hashToken(raw)).not.toBe(createHash('sha256').update(Buffer.from(raw, 'latin1')).digest('hex'));
  });

  it('is 64 lowercase hex characters, the width of the token_hash columns', () => {
    expect(hashToken('0123456789abcdefghijklmnopqrstuv')).toMatch(/^[0-9a-f]{64}$/);
  });
});
