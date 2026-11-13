import { z } from 'zod';
import { canonicalJson, intentDigest, prepareIntentArgs, sha256Canonical } from '../intent-digest';

const schema = z.object({
  invoice: z.object({ amount: z.number(), currency: z.string().default('USD') }).optional(),
  to: z.string().optional(),
  note: z.string().optional(),
  priority: z.enum(['low', 'high']).default('low'),
  tags: z.array(z.string()).optional(),
});

describe('intentDigest (one digest for chat grants and agent challenges)', () => {
  it('differs for two calls that differ only inside a nested object', () => {
    // The old digest passed the top-level keys as a JSON.stringify allow-list, so both of these hashed `{"invoice":{}}`.
    expect(intentDigest(schema, { invoice: { amount: 5 } })).not.toBe(
      intentDigest(schema, { invoice: { amount: 500 } }),
    );
  });

  it('differs for two calls that differ only inside a field the log redacts', () => {
    // Both emails redact to `[redacted-email]`; the digest is over the exact values, so a swap cannot ride an approval.
    expect(intentDigest(schema, { to: 'alice@example.com' })).not.toBe(
      intentDigest(schema, { to: 'mallory@example.com' }),
    );
    expect(intentDigest(schema, { note: '415-555-1212' })).not.toBe(intentDigest(schema, { note: '415-555-9999' }));
  });

  it('is the same however the call is spelled: key order at every depth, defaults, `_` keys, unknown keys', () => {
    const a = intentDigest(schema, { invoice: { amount: 5 }, to: 'a@b.co' });
    const b = intentDigest(schema, {
      to: 'a@b.co',
      _confirmToken: '12',
      _tenantId: 7,
      priority: 'low',
      notInSchema: true,
      invoice: { currency: 'USD', amount: 5 },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps array order (a reordered list is a different call)', () => {
    expect(intentDigest(schema, { tags: ['a', 'b'] })).not.toBe(intentDigest(schema, { tags: ['b', 'a'] }));
  });

  it('a changed default-valued field is a different call', () => {
    expect(intentDigest(schema, {})).not.toBe(intentDigest(schema, { priority: 'high' }));
  });

  it('still digests arguments the schema rejects (a mismatch is refused, never thrown)', () => {
    const bad = { invoice: { amount: 'five' } };
    expect(() => intentDigest(schema, bad)).not.toThrow();
    expect(intentDigest(schema, bad)).not.toBe(intentDigest(schema, { invoice: { amount: 5 } }));
  });

  it('works with no schema: `_` keys dropped, keys sorted at every depth', () => {
    expect(intentDigest(undefined, { b: { y: 1, x: 2 }, a: 1, _userId: '9' })).toBe(
      intentDigest(undefined, { a: 1, b: { x: 2, y: 1 } }),
    );
    expect(intentDigest(undefined, { b: { x: 1 } })).not.toBe(intentDigest(undefined, { b: { x: 2 } }));
  });
});

describe('prepareIntentArgs', () => {
  it('returns the arguments as the tool will see them', () => {
    expect(prepareIntentArgs(schema, { _tenantId: 1, extra: 1, invoice: { amount: 5 } })).toEqual({
      ok: true,
      data: { invoice: { amount: 5, currency: 'USD' }, priority: 'low' },
    });
  });

  it('reports what the tool would reject', () => {
    expect(prepareIntentArgs(schema, { priority: 'urgent' }).ok).toBe(false);
  });
});

describe('canonicalJson / sha256Canonical', () => {
  it('sorts keys at every depth and drops undefined object values', () => {
    expect(canonicalJson({ b: [{ d: 1, c: 2 }], a: undefined, e: null })).toBe('{"b":[{"c":2,"d":1}],"e":null}');
  });

  it('hashes equal structures equally', () => {
    expect(sha256Canonical({ a: { y: 1, x: 2 } })).toBe(sha256Canonical({ a: { x: 2, y: 1 } }));
  });
});
