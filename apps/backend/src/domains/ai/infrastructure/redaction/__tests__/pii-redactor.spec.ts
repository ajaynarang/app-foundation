import { redactPii, redactMessages, PII_FIELD_ALLOWLIST } from '../pii-redactor';

describe('redactPii', () => {
  it('redacts every allowlisted field name (case-insensitive)', () => {
    for (const field of PII_FIELD_ALLOWLIST) {
      const input = { [field]: 'sensitive', keep: 'visible' };
      const out = redactPii(input) as Record<string, string>;
      expect(out[field]).toBe('[REDACTED]');
      expect(out.keep).toBe('visible');
    }
  });

  it('matches allowlisted keys regardless of case', () => {
    const out = redactPii({ SSN: '123', DlNumber: '456', BankAccount: '789' }) as Record<string, string>;
    expect(out.SSN).toBe('[REDACTED]');
    expect(out.DlNumber).toBe('[REDACTED]');
    expect(out.BankAccount).toBe('[REDACTED]');
  });

  it('leaves non-allowlisted fields untouched', () => {
    const input = { name: 'Acme', loadNumber: 'LD-1', rateCents: 150000 };
    expect(redactPii(input)).toEqual(input);
  });

  it('recurses into nested objects', () => {
    const input = { driver: { name: 'Jo', ssn: '111-22-3333' }, ok: true };
    const out = redactPii(input) as any;
    expect(out.driver.ssn).toBe('[REDACTED]');
    expect(out.driver.name).toBe('Jo');
    expect(out.ok).toBe(true);
  });

  it('recurses into arrays', () => {
    const input = [{ dlNumber: 'D1' }, { dlNumber: 'D2', city: 'Dallas' }];
    const out = redactPii(input) as any[];
    expect(out[0].dlNumber).toBe('[REDACTED]');
    expect(out[1].dlNumber).toBe('[REDACTED]');
    expect(out[1].city).toBe('Dallas');
  });

  it('passes primitives through untouched (no key to match on)', () => {
    expect(redactPii('a free-text ssn 111-22-3333 in prose')).toBe('a free-text ssn 111-22-3333 in prose');
    expect(redactPii(42)).toBe(42);
    expect(redactPii(null)).toBeNull();
    expect(redactPii(true)).toBe(true);
  });

  it('does not mutate the input (pure)', () => {
    const input = { ssn: 'secret', nested: { dob: '2000-01-01' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactPii(input);
    expect(input).toEqual(snapshot);
  });

  it('does NOT redact PII embedded in free text (documented out-of-scope)', () => {
    // Field-name based only. A driver license number inside a content string
    // is not caught — that's the explicit scope boundary.
    const input = { content: 'My license is D1234567 and SSN 111-22-3333' };
    const out = redactPii(input) as Record<string, string>;
    expect(out.content).toBe('My license is D1234567 and SSN 111-22-3333');
  });

  // A file message part carries raw bytes (Buffer / typed array). These are
  // objects but have no string field names to redact — recursing into them
  // via Object.entries() rebuilds a plain { '0': n, ... } object, which the AI
  // SDK's DataContent validator rejects ("messages do not match the
  // ModelMessage[] schema"). Binary content must pass through by reference.
  it('preserves a Buffer by reference (does not turn it into a numeric-keyed object)', () => {
    const buf = Buffer.from('%PDF-1.4 bytes');
    const out = redactPii(buf);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out).toBe(buf);
  });

  it('preserves a Uint8Array / ArrayBuffer by reference', () => {
    const u8 = new Uint8Array([1, 2, 3]);
    const ab = new ArrayBuffer(8);
    expect(redactPii(u8)).toBe(u8);
    expect(redactPii(ab)).toBe(ab);
  });

  it('preserves binary data nested inside a message part (the ratecon vision case)', () => {
    const fileBuffer = Buffer.from('%PDF-1.4 fake bytes');
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'extract this' },
          { type: 'file', data: fileBuffer, mediaType: 'application/pdf' },
        ],
      },
    ];
    const out = redactMessages(messages) as any[];
    const data = out[0].content[1].data;
    expect(Buffer.isBuffer(data)).toBe(true);
    expect(data).toBe(fileBuffer);
  });
});

describe('redactMessages', () => {
  it('redacts allowlisted fields inside structured message parts', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'data', bankAccount: '999' },
        ],
      },
    ];
    const out = redactMessages(messages) as any[];
    expect(out[0].content[1].bankAccount).toBe('[REDACTED]');
    expect(out[0].content[0].text).toBe('hi');
  });

  it('leaves string content untouched (free text, out of scope)', () => {
    const messages = [{ role: 'user', content: 'my ssn is 111-22-3333' }];
    const out = redactMessages(messages) as any[];
    expect(out[0].content).toBe('my ssn is 111-22-3333');
  });
});
