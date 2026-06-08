import { redactArgs, digestArgs } from '../arg-redactor';

describe('redactArgs', () => {
  it('removes internal _tenantId / _userId / _confirmToken keys', () => {
    const out = redactArgs({
      _tenantId: 5,
      _userId: '1',
      _confirmToken: 'x',
      a: 1,
    });
    expect(out).toEqual({ a: 1 });
  });

  it('redacts email-looking values', () => {
    const out = redactArgs({ to: 'driver@acme.com', subject: 'hi' }) as any;
    expect(out.to).toBe('[redacted-email]');
    expect(out.subject).toBe('hi');
  });

  it('redacts phone-looking values', () => {
    const out = redactArgs({ phone: '+1 (415) 555-1212' }) as any;
    expect(out.phone).toBe('[redacted-phone]');
  });

  it('redacts SSN-looking values', () => {
    const out = redactArgs({ ssn: '123-45-6789' }) as any;
    expect(out.ssn).toBe('[redacted-ssn]');
  });

  it('recurses into nested objects and arrays', () => {
    const out = redactArgs({
      driver: { email: 'a@b.com', phones: ['555-1234567'] },
    }) as any;
    expect(out.driver.email).toBe('[redacted-email]');
    expect(out.driver.phones[0]).toBe('[redacted-phone]');
  });
});

describe('digestArgs', () => {
  it('returns a stable SHA-256 hex for equivalent args', () => {
    const a = digestArgs({ a: 1, b: 2 });
    const b = digestArgs({ b: 2, a: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
