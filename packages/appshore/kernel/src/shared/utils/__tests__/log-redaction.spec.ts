import { maskEmail, maskPhone, scrubContactDetails, stripQueryString } from '../log-redaction';

describe('maskEmail', () => {
  it('keeps the first letter and the domain, lower-cased', () => {
    expect(maskEmail('Ops@Example.COM')).toBe('o***@example.com');
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskEmail('  ops@example.org ')).toBe('o***@example.org');
  });

  it('returns *** when there is no local part or no @', () => {
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('returns *** for null, undefined and empty input', () => {
    expect(maskEmail(null)).toBe('***');
    expect(maskEmail(undefined)).toBe('***');
    expect(maskEmail('')).toBe('***');
  });
});

describe('maskPhone', () => {
  it('keeps only the last four digits of an E.164 number', () => {
    expect(maskPhone('+19785551234')).toBe('***1234');
  });

  it('ignores formatting characters', () => {
    expect(maskPhone('(978) 555-1234')).toBe('***1234');
  });

  it('never returns more than four digits', () => {
    expect(maskPhone('+447911123456').replace(/\D/g, '')).toHaveLength(4);
  });

  it('returns *** for empty input', () => {
    expect(maskPhone(undefined)).toBe('***');
    expect(maskPhone('')).toBe('***');
  });
});

describe('stripQueryString', () => {
  it('drops an SSE token query string', () => {
    expect(stripQueryString('/api/v1/sse/stream?token=eyJhbGciOiJIUzI1NiJ9.x.y')).toBe('/api/v1/sse/stream');
  });

  it('drops every query parameter, not just token', () => {
    expect(stripQueryString('/api/v1/oauth/callback?code=abc&state=xyz')).toBe('/api/v1/oauth/callback');
  });

  it('drops a fragment', () => {
    expect(stripQueryString('/accept-invitation#token=abc')).toBe('/accept-invitation');
  });

  it('leaves a URL without a query string unchanged', () => {
    expect(stripQueryString('/api/v1/tickets/TK-1')).toBe('/api/v1/tickets/TK-1');
  });

  it('returns an empty string for missing input', () => {
    expect(stripQueryString(undefined)).toBe('');
    expect(stripQueryString(null)).toBe('');
  });
});

describe('scrubContactDetails', () => {
  it('masks an email inside a provider error message', () => {
    expect(scrubContactDetails('550 rejected: <Ops@Example.COM> mailbox full')).toBe(
      '550 rejected: <o***@example.com> mailbox full',
    );
  });

  it('masks an E.164 phone inside a provider error message', () => {
    expect(scrubContactDetails("The 'To' number +19785551234 is not a valid phone number.")).toBe(
      "The 'To' number ***1234 is not a valid phone number.",
    );
  });

  it('leaves ids, timestamps and stack line numbers alone', () => {
    const text = 'Ticket TK-1234 failed at 1730000000000 (/app/dist/main.js:120:45)';
    expect(scrubContactDetails(text)).toBe(text);
  });

  it('leaves scoped package paths in stack frames alone', () => {
    const text = [
      '    at Router.handle (/app/node_modules/@nestjs/core/router.js:120:45)',
      '    at load (/app/node_modules/.pnpm/@prisma+client@7.3.0/node_modules/@prisma/client/runtime.js:9:1)',
      '    at C:\\app\\node_modules\\@sentry\\node\\index.js:3:7',
    ].join('\n');

    expect(scrubContactDetails(text)).toBe(text);
  });

  it('still masks an email next to a path in the same stack', () => {
    const text = 'Error: bounce ops@example.com\n    at send (/app/node_modules/@nestjs/core/router.js:1:1)';

    expect(scrubContactDetails(text)).toBe(
      'Error: bounce o***@example.com\n    at send (/app/node_modules/@nestjs/core/router.js:1:1)',
    );
  });
});
