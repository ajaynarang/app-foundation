import { BadRequestException } from '@nestjs/common';
import type { LookupAddress } from 'node:dns';
import {
  assertDeliverableWebhookUrl,
  assertSafeWebhookTarget,
  assertSafeWebhookUrl,
  createSafeLookup,
  createSafeWebhookAgents,
  isBlockedAddress,
  isUnsafeWebhookTargetError,
  UnsafeWebhookTargetError,
} from '../webhook-url.validator';

const resolverReturning =
  (addresses: LookupAddress[] | Error) =>
  (_host: string, _opts: unknown, cb: (err: Error | null, addresses: LookupAddress[]) => void) =>
    addresses instanceof Error ? cb(addresses, []) : cb(null, addresses);

/** The SSRF guard: what an outbound webhook may never reach, at save time and at send time. */
describe('isBlockedAddress', () => {
  it.each([
    ['0.0.0.0'],
    ['10.1.2.3'],
    ['100.64.0.1'], // CGNAT
    ['127.0.0.1'],
    ['127.255.255.254'],
    ['169.254.169.254'], // cloud metadata
    ['172.16.0.1'],
    ['172.31.255.255'],
    ['192.0.0.170'],
    ['192.168.1.1'],
    ['198.18.0.1'],
    ['224.0.0.1'], // multicast
    ['255.255.255.255'],
    ['::'],
    ['::1'],
    ['::ffff:127.0.0.1'], // IPv4-mapped loopback
    ['::ffff:a9fe:a9fe'], // IPv4-mapped 169.254.169.254 in hex form
    ['64:ff9b::a9fe:a9fe'], // NAT64 of the metadata address
    ['2002:a9fe:a9fe::1'], // 6to4 of the metadata address
    ['fc00::1'],
    ['fd00:ec2::254'], // AWS IMDS over IPv6
    ['fe80::1'],
    ['fe80::1%en0'], // zone id
    ['[::1]'], // bracketed, as in a URL host
    ['::ffff:0:7f00:1'], // SIIT-translated 127.0.0.1
    ['::a9fe:a9fe'], // IPv4-compatible 169.254.169.254
    ['ff02::1'],
    ['2001:db8::1'], // documentation
    ['not-an-ip'],
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([['8.8.8.8'], ['93.184.216.34'], ['172.32.0.1'], ['2606:4700:4700::1111'], ['::ffff:8.8.8.8']])(
    'allows public %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('assertSafeWebhookUrl (save time, the URL text)', () => {
  const refused = (url: string, allowPrivate = false) =>
    expect(() => assertSafeWebhookUrl(url, { allowPrivate })).toThrow(BadRequestException);

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/hook',
    'https://0x7f.1/hook', // the URL parser normalises this to 127.0.0.1
    'https://2130706433/hook', // decimal 127.0.0.1
    'https://[::1]/hook',
    'https://[::ffff:169.254.169.254]/hook',
    'https://10.0.0.5/hook',
    'https://100.64.0.1/hook',
    'https://localhost/hook',
    'https://localhost./hook', // trailing dot
    'https://foo.internal./hook',
    'https://api.localhost/hook',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://printer.local/hook',
    'https://redis/hook', // single-label names resolve inside the platform's own network
    'http://partner.example.com/hook', // cleartext
    'ftp://partner.example.com/hook',
    'not a url',
  ])('refuses %s', (url) => refused(url));

  it('accepts a public https URL', () => {
    expect(() => assertSafeWebhookUrl('https://partner.example.com/hooks/app')).not.toThrow();
  });

  it('the dev escape hatch allows a local http receiver, but never a non-http scheme or the metadata service', () => {
    expect(() => assertSafeWebhookUrl('http://localhost:4000/hook', { allowPrivate: true })).not.toThrow();
    expect(() => assertSafeWebhookUrl('http://10.0.0.5/hook', { allowPrivate: true })).not.toThrow();
    expect(() => assertSafeWebhookUrl('http://host.docker.internal:4000/hook', { allowPrivate: true })).not.toThrow();
    refused('file:///etc/passwd', true);
    refused('http://169.254.169.254/latest/meta-data/', true);
    refused('http://[fd00:ec2::254]/latest/meta-data/', true);
    refused('http://[::ffff:169.254.169.254]/', true);
    refused('http://100.100.100.200/', true);
    refused('http://metadata.google.internal/computeMetadata/v1/', true);
    refused('http://metadata.google.internal./computeMetadata/v1/', true);
    refused('http://[::a9fe:a9fe]/', true);
  });
});

describe('assertSafeWebhookTarget (save time, the resolved addresses)', () => {
  const url = 'https://hook.partner-site.com/in';

  it('accepts a host whose every address is public', async () => {
    const resolve = resolverReturning([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ]);
    await expect(assertSafeWebhookTarget(url, { resolve })).resolves.toBeUndefined();
  });

  it.each([
    ['a private address', '10.0.0.5'],
    ['loopback', '127.0.0.1'],
    ['the metadata address', '169.254.169.254'],
    ['CGNAT', '100.64.0.9'],
    ['an IPv6-mapped private address', '::ffff:192.168.1.10'],
    ['IPv6 unique-local', 'fd12:3456::1'],
  ])('refuses a public-looking name that resolves to %s, even after a public address', async (_label, address) => {
    const resolve = resolverReturning([
      { address: '93.184.216.34', family: 4 },
      { address, family: address.includes(':') ? 6 : 4 },
    ]);
    await expect(assertSafeWebhookTarget(url, { resolve })).rejects.toThrow(BadRequestException);
  });

  it('refuses a host that does not resolve', async () => {
    await expect(assertSafeWebhookTarget(url, { resolve: resolverReturning(new Error('ENOTFOUND')) })).rejects.toThrow(
      /could not be resolved/,
    );
    await expect(assertSafeWebhookTarget(url, { resolve: resolverReturning([]) })).rejects.toThrow(BadRequestException);
  });

  it('refuses an unsafe URL before resolving anything, and does not resolve an IP literal', async () => {
    const resolve = jest.fn();
    await expect(assertSafeWebhookTarget('https://127.0.0.1/hook', { resolve })).rejects.toThrow(BadRequestException);
    await expect(assertSafeWebhookTarget('https://93.184.216.34/hook', { resolve })).resolves.toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('under the escape hatch a private answer passes and a metadata answer does not', async () => {
    const local = resolverReturning([{ address: '127.0.0.1', family: 4 }]);
    await expect(
      assertSafeWebhookTarget('http://receiver.test:4000/hook', { allowPrivate: true, resolve: local }),
    ).resolves.toBeUndefined();
    const metadata = resolverReturning([{ address: '169.254.169.254', family: 4 }]);
    await expect(
      assertSafeWebhookTarget('http://receiver.test:4000/hook', { allowPrivate: true, resolve: metadata }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('assertDeliverableWebhookUrl (send time, literal hosts)', () => {
  it('throws UnsafeWebhookTargetError for a literal private address or an internal name', () => {
    expect(() => assertDeliverableWebhookUrl('https://169.254.169.254/x')).toThrow(UnsafeWebhookTargetError);
    expect(() => assertDeliverableWebhookUrl('http://10.0.0.5/x')).toThrow(UnsafeWebhookTargetError);
    expect(() => assertDeliverableWebhookUrl('https://localhost/x')).toThrow(UnsafeWebhookTargetError);
    expect(() => assertDeliverableWebhookUrl('ftp://example.com/x')).toThrow(UnsafeWebhookTargetError);
    expect(() => assertDeliverableWebhookUrl('::not a url')).toThrow(UnsafeWebhookTargetError);
  });

  it('passes a public host (its addresses are checked by the safe lookup), including an http URL saved earlier', () => {
    expect(() => assertDeliverableWebhookUrl('https://partner.example.com/x')).not.toThrow();
    expect(() => assertDeliverableWebhookUrl('http://partner.example.com/x')).not.toThrow();
    expect(() => assertDeliverableWebhookUrl('http://127.0.0.1:4000/x', { allowPrivate: true })).not.toThrow();
  });
});

describe('createSafeLookup (send time, resolved addresses: DNS rebinding)', () => {
  const run = (lookup: ReturnType<typeof createSafeLookup>, options: object) =>
    new Promise<{ err: Error | null; address?: unknown; family?: number }>((resolve) =>
      lookup(
        'hook.example.com',
        options as never,
        ((err: Error | null, address?: unknown, family?: number) => resolve({ err, address, family })) as never,
      ),
    );

  it('refuses a name that resolves to a private address, even when a public one comes first', async () => {
    const lookup = createSafeLookup({
      resolve: resolverReturning([
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ]),
    });
    const { err } = await run(lookup, {});
    expect(isUnsafeWebhookTargetError(err)).toBe(true);
  });

  it('answers with the first address, or all of them when asked (happy eyeballs)', async () => {
    const addresses = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ];
    const lookup = createSafeLookup({ resolve: resolverReturning(addresses) });
    expect(await run(lookup, {})).toEqual({ err: null, address: '93.184.216.34', family: 4 });
    expect(await run(lookup, { all: true })).toEqual({ err: null, address: addresses, family: undefined });
  });

  it('passes resolver errors through, and allows private answers under the escape hatch', async () => {
    const failing = createSafeLookup({ resolve: resolverReturning(new Error('ENOTFOUND')) });
    expect((await run(failing, {})).err?.message).toBe('ENOTFOUND');

    const empty = createSafeLookup({ resolve: resolverReturning([]) });
    expect((await run(empty, {})).err).toBeInstanceOf(Error);

    const local = createSafeLookup({
      allowPrivate: true,
      resolve: resolverReturning([{ address: '127.0.0.1', family: 4 }]),
    });
    expect(await run(local, {})).toEqual({ err: null, address: '127.0.0.1', family: 4 });
  });

  it('uses the real resolver by default and refuses localhost', async () => {
    const { err } = await new Promise<{ err: Error | null }>((resolve) =>
      createSafeLookup()('localhost', {} as never, ((err: Error | null) => resolve({ err })) as never),
    );
    expect(isUnsafeWebhookTargetError(err)).toBe(true);
  });
});

describe('createSafeWebhookAgents', () => {
  it('builds http and https agents that carry the safe lookup', () => {
    const { httpAgent, httpsAgent } = createSafeWebhookAgents();
    expect((httpAgent as unknown as { options: { lookup: unknown } }).options.lookup).toEqual(expect.any(Function));
    expect((httpsAgent as unknown as { options: { lookup: unknown } }).options.lookup).toEqual(expect.any(Function));
  });

  it('recognises the unsafe-target error when an HTTP client wraps it as a cause', () => {
    const inner = new UnsafeWebhookTargetError('resolves to a non-public address (169.254.169.254)');
    expect(isUnsafeWebhookTargetError({ cause: inner })).toBe(true);
    expect(isUnsafeWebhookTargetError({ code: 'EUNSAFETARGET' })).toBe(true);
    expect(isUnsafeWebhookTargetError(new Error('ECONNREFUSED'))).toBe(false);
    expect(isUnsafeWebhookTargetError(null)).toBe(false);
  });
});
