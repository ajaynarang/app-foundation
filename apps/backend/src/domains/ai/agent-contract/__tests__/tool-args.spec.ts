import { z } from 'zod';
import { validateToolArgs } from '../tool-args';
import { withoutInternalKeys } from '../arg-redactor';

describe('validateToolArgs', () => {
  const schema = z.object({
    subject: z.string().min(1),
    limit: z.number().int().max(10).default(5),
    nested: z.object({ amount: z.number() }).optional(),
  });

  it('returns the parsed args: defaults applied, unknown keys stripped', () => {
    expect(validateToolArgs(schema, { subject: 'Hi', extra: true })).toEqual({
      ok: true,
      data: { subject: 'Hi', limit: 5 },
    });
  });

  it('drops every `_`-prefixed key before parsing, so the caller can never set one', () => {
    const schemaWithUnderscore = z.object({ _tenantId: z.number().optional(), q: z.string() }).passthrough();
    const res = validateToolArgs(schemaWithUnderscore, {
      q: 'x',
      _tenantId: 999,
      _role: 'OWNER',
      _confirmToken: 't',
      _invocationSource: 'desk',
    });
    expect(res).toEqual({ ok: true, data: { q: 'x' } });
  });

  it('answers a failure with VALIDATION_FAILED and one message per field, nested fields as dot paths', () => {
    const res = validateToolArgs(schema, { subject: '', limit: 50, nested: { amount: 'lots' } });
    expect(res.ok).toBe(false);
    if (!('failure' in res)) throw new Error('expected a failure');
    expect(res.failure.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.failure.fieldErrors).sort()).toEqual(['limit', 'nested.amount', 'subject']);
    expect(res.failure.error).toBe('3 fields are missing or invalid');
  });

  it('with no schema, passes the args through minus `_` keys', () => {
    expect(validateToolArgs(undefined, { a: 1, _b: 2 })).toEqual({ ok: true, data: { a: 1 } });
    expect(validateToolArgs(null, undefined)).toEqual({ ok: true, data: {} });
  });

  it('withoutInternalKeys keeps only the caller-owned keys', () => {
    expect(withoutInternalKeys({ a: 1, _a: 2, b_: 3 })).toEqual({ a: 1, b_: 3 });
  });
});
