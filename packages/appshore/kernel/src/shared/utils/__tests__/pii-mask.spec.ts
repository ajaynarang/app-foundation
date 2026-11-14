import { maskPii, maskPiiDeep } from '../pii-mask';

describe('maskPii', () => {
  it('masks an email inside a prompt', () => {
    expect(maskPii('Send the report to ops.lead+reports@acme-example.co.uk today')).toBe(
      'Send the report to <EMAIL> today',
    );
  });

  it.each([
    ['E.164', 'Text the customer at +15551234567 now', 'Text the customer at <PHONE> now'],
    ['parenthesised area code', 'Call (555) 123-4567 for the office', 'Call <PHONE> for the office'],
    ['dashes', 'Mobile: 555-123-4567.', 'Mobile: <PHONE>.'],
    ['dots with country code', 'Support line +1 555.123.4567', 'Support line <PHONE>'],
    ['toll-free with leading 1', 'Helpdesk 1-800-555-1234 after hours', 'Helpdesk <PHONE> after hours'],
    ['spaces', 'reach me on 555 123 4567', 'reach me on <PHONE>'],
  ])('masks a phone written with %s', (_format, input, expected) => {
    expect(maskPii(input)).toBe(expected);
  });

  it('masks every phone and email in a multi-contact prompt', () => {
    const prompt = 'Who is Maria (maria@example.com, +15559876543)? Her backup is 555-222-3333.';

    expect(maskPii(prompt)).toBe('Who is Maria (<EMAIL>, <PHONE>)? Her backup is <PHONE>.');
  });

  it.each([
    ['an order number', 'Order 4815162342 shipped'],
    ['an epoch timestamp', 'updatedAt 1761609600'],
    ['an ISO date', 'Due 2026-10-28T14:00:00Z'],
    ['an amount', 'Total $1,234.56 for 2,310 units'],
    ['a UUID', 'episode 550e8400-e29b-41d4-a716-446655440000'],
    ['a tenant reference', 'sessionId app-ai:tenant_42'],
  ])('leaves %s untouched', (_kind, input) => {
    expect(maskPii(input)).toBe(input);
  });

  it('masks inside a serialised AI SDK prompt attribute', () => {
    const serialised = JSON.stringify([{ role: 'user', content: [{ type: 'text', text: 'email bob@x.io' }] }]);

    expect(JSON.parse(maskPii(serialised))[0].content[0].text).toBe('email <EMAIL>');
  });

  it('masks an email that follows a long dotted token', () => {
    expect(maskPii('ref a.b-c.d see ops@acme.com')).toBe('ref a.b-c.d see <EMAIL>');
  });

  it.each([
    ['no @ anywhere', 'a.b-'.repeat(50_000)],
    ['an @ before a long run with no second @', `cc @ ${'a.b-'.repeat(50_000)}`],
  ])('scans a ~200KB attribute with %s in linear time', (_shape, input) => {
    const startedAt = performance.now();

    expect(maskPii(input)).toBe(input);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});

describe('maskPiiDeep', () => {
  it('masks strings nested in arrays and objects without mutating the input', () => {
    const input = {
      messages: [{ role: 'user', content: 'my phone +15551234567' }],
      meta: { contact: 'a@b.com', count: 412, done: true, note: null },
    };

    const masked = maskPiiDeep(input);

    expect(masked).toEqual({
      messages: [{ role: 'user', content: 'my phone <PHONE>' }],
      meta: { contact: '<EMAIL>', count: 412, done: true, note: null },
    });
    expect(input.messages[0].content).toBe('my phone +15551234567');
  });

  it('keeps a shared, non-circular reference masked in both places', () => {
    const contact = { email: 'dup@example.com' };

    expect(maskPiiDeep({ from: contact, to: contact })).toEqual({
      from: { email: '<EMAIL>' },
      to: { email: '<EMAIL>' },
    });
  });

  it('cuts a circular reference instead of recursing forever', () => {
    const node: Record<string, unknown> = { email: 'loop@example.com' };
    node.self = node;

    expect(maskPiiDeep(node)).toEqual({ email: '<EMAIL>', self: '[Circular]' });
  });

  it('returns dates and binary buffers untouched', () => {
    const when = new Date('2026-10-28T00:00:00Z');
    const bytes = new Uint8Array([1, 2, 3]);

    const masked = maskPiiDeep({ when, bytes });

    expect(masked.when).toBe(when);
    expect(masked.bytes).toBe(bytes);
  });

  it('masks strings held by a class instance', () => {
    class Contact {
      constructor(
        readonly name: string,
        readonly phone: string,
        readonly details: { email: string },
      ) {}
    }

    const masked = maskPiiDeep({ contact: new Contact('Jose', '+15551234567', { email: 'jose@example.com' }) });

    expect(masked.contact).toEqual({ name: 'Jose', phone: '<PHONE>', details: { email: '<EMAIL>' } });
  });

  it('keeps an Error readable while masking its message and stack', () => {
    const error = new Error('SMS to 555-123-4567 failed');

    const masked = maskPiiDeep({ error }).error as unknown as Record<string, unknown>;

    expect(masked).toMatchObject({ name: 'Error', message: 'SMS to <PHONE> failed' });
    expect(masked.stack).not.toContain('555-123-4567');
  });

  it('uses the JSON form of an object that defines toJSON', () => {
    class Payload {
      toJSON() {
        return { to: 'ops@example.com' };
      }
    }

    expect(maskPiiDeep(new Payload())).toEqual({ to: '<EMAIL>' });
  });

  it('replaces an object that cannot be serialised with a marker', () => {
    class Node {
      self: Node = this;
      email = 'loop@example.com';
    }

    expect(maskPiiDeep({ node: new Node() }).node).toBe('[Unserialisable]');
  });

  it('passes primitives and nullish values through', () => {
    expect(maskPiiDeep(42)).toBe(42);
    expect(maskPiiDeep(undefined)).toBeUndefined();
    expect(maskPiiDeep(null)).toBeNull();
  });
});
