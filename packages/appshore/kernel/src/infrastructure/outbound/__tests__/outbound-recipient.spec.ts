import {
  OUTBOUND_ALLOW_KIND,
  buildAllowSet,
  isEmailAllowed,
  isPhoneAllowed,
  isUrlAllowed,
  maskEmail,
  maskPhone,
  maskUrl,
  mergeAllowSets,
  normalizeAllowValue,
  normalizePhone,
  parseBootstrapAllowList,
  redactPreview,
} from '../outbound-recipient';

const allow = buildAllowSet([
  { kind: OUTBOUND_ALLOW_KIND.EMAIL, value: 'owner@gmail.com' },
  { kind: OUTBOUND_ALLOW_KIND.EMAIL_DOMAIN, value: 'example.com' },
  { kind: OUTBOUND_ALLOW_KIND.PHONE, value: '+19785551234' },
  { kind: OUTBOUND_ALLOW_KIND.HOST, value: 'webhook.site' },
]);

describe('normalizeAllowValue', () => {
  it('lowercases emails', () => {
    expect(normalizeAllowValue(OUTBOUND_ALLOW_KIND.EMAIL, ' Owner@Gmail.COM ')).toBe('owner@gmail.com');
  });

  it('strips a leading @ and trailing dot from domains and hosts', () => {
    expect(normalizeAllowValue(OUTBOUND_ALLOW_KIND.EMAIL_DOMAIN, '@Example.com')).toBe('example.com');
    expect(normalizeAllowValue(OUTBOUND_ALLOW_KIND.HOST, 'Webhook.Site.')).toBe('webhook.site');
  });

  it('keeps the digits of a phone behind a +, assuming no country', () => {
    expect(normalizeAllowValue(OUTBOUND_ALLOW_KIND.PHONE, '+1 (978) 555-1234')).toBe('+19785551234');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('919812345678')).toBe('+919812345678');
  });
});

describe('isEmailAllowed', () => {
  it('matches an exact address regardless of case', () => {
    expect(isEmailAllowed('OWNER@gmail.com', allow)).toBe(true);
  });

  it('does not match another address at the same provider', () => {
    expect(isEmailAllowed('someone@gmail.com', allow)).toBe(false);
  });

  it('matches an allow-listed domain and its subdomains', () => {
    expect(isEmailAllowed('qa@example.com', allow)).toBe(true);
    expect(isEmailAllowed('qa@mail.example.com', allow)).toBe(true);
  });

  it('does not match a domain that merely ends with the same letters', () => {
    expect(isEmailAllowed('x@notexample.com', allow)).toBe(false);
  });

  it('rejects a list or display-name form that could smuggle in a second recipient', () => {
    expect(isEmailAllowed('real@customer.test, qa@example.com', allow)).toBe(false);
    expect(isEmailAllowed('real@customer.test;qa@example.com', allow)).toBe(false);
    expect(isEmailAllowed('QA <qa@example.com>', allow)).toBe(false);
  });

  it('rejects a value with no @', () => {
    expect(isEmailAllowed('example.com', allow)).toBe(false);
  });
});

describe('isPhoneAllowed', () => {
  it('matches across formatting', () => {
    expect(isPhoneAllowed('+1 978-555-1234', allow)).toBe(true);
  });

  it('rejects other numbers', () => {
    expect(isPhoneAllowed('+19785550000', allow)).toBe(false);
  });
});

describe('isUrlAllowed', () => {
  it('matches the host and its subdomains', () => {
    expect(isUrlAllowed('https://webhook.site/abc?x=1', allow)).toBe(true);
    expect(isUrlAllowed('https://eu.webhook.site/abc', allow)).toBe(true);
  });

  it('rejects other hosts and malformed URLs', () => {
    expect(isUrlAllowed('https://hooks.customer.test/x', allow)).toBe(false);
    expect(isUrlAllowed('not a url', allow)).toBe(false);
  });
});

describe('parseBootstrapAllowList', () => {
  it('reads each item by its shape', () => {
    expect(
      parseBootstrapAllowList(' Ops@Example.com, @team.example.org, +91 98123 45678, Hooks.Example.net ,'),
    ).toEqual([
      { kind: OUTBOUND_ALLOW_KIND.EMAIL, value: 'ops@example.com' },
      { kind: OUTBOUND_ALLOW_KIND.EMAIL_DOMAIN, value: 'team.example.org' },
      { kind: OUTBOUND_ALLOW_KIND.PHONE, value: '+919812345678' },
      { kind: OUTBOUND_ALLOW_KIND.HOST, value: 'hooks.example.net' },
    ]);
  });

  it('is empty when unset or blank', () => {
    expect(parseBootstrapAllowList(undefined)).toEqual([]);
    expect(parseBootstrapAllowList(' , ')).toEqual([]);
  });

  it('merges with the database list', () => {
    const merged = mergeAllowSets(allow, buildAllowSet(parseBootstrapAllowList('first@admin.test')));
    expect(isEmailAllowed('first@admin.test', merged)).toBe(true);
    expect(isEmailAllowed('owner@gmail.com', merged)).toBe(true);
  });
});

describe('masking', () => {
  it('keeps the first letter and domain of an email', () => {
    expect(maskEmail('Dispatch@Customer.test')).toBe('d***@customer.test');
  });

  it('keeps the last four digits of a phone', () => {
    expect(maskPhone('+19785551234')).toBe('***1234');
  });

  it('keeps only the host of a URL', () => {
    expect(maskUrl('https://hooks.customer.test/path?token=secret')).toBe('hooks.customer.test');
    expect(maskUrl('garbage')).toBe('***');
  });
});

describe('redactPreview', () => {
  it('hides a sign-in code', () => {
    expect(redactPreview('785011 is your sign-in code')).toBe('•••• is your sign-in code');
  });

  it('hides links, which can carry invitation and reset tokens', () => {
    expect(redactPreview('You are invited: https://app.example.com/accept?token=secret')).toBe(
      'You are invited: [link]',
    );
  });

  it('hides split codes and scheme-less links', () => {
    expect(redactPreview('Code 123-456, open www.example.com/i/TOKEN')).toBe('Code ••••, open [link]');
  });

  it('masks an address in the text', () => {
    expect(redactPreview('Reply to Ops@Customer.test')).toBe('Reply to o***@customer.test');
  });

  it('keeps business numbers readable', () => {
    expect(redactPreview('Invoice INV-2026-0001 for ORD-1234')).toBe('Invoice INV-2026-0001 for ORD-1234');
  });
});
