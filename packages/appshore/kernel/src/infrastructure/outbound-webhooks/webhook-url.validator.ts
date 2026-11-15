import { BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions } from 'node:dns';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * The outbound-webhook SSRF guard. A tenant admin chooses where the server sends HTTP requests, so the server must
 * never be pointed at its own network: private, loopback, link-local, unique-local, CGNAT, multicast, reserved and
 * cloud-metadata addresses are refused
 *
 * - when a subscription is saved, on the URL and on every address its host resolves to
 *   (`assertSafeWebhookTarget`, a 400), and
 * - when a delivery is sent, again on the URL (`assertDeliverableWebhookUrl`) and on every address the host
 *   resolves to at that moment (`createSafeWebhookAgents`). The socket connects to an address that check returned,
 *   so a public name that later resolves inward (DNS rebinding) is refused on the very connection that would have
 *   used it.
 *
 * `allowPrivate` is a development escape hatch for a receiver on localhost; callers derive it from config and it is
 * never on in production.
 */

const BLOCKED_V4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. 169.254.169.254 cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  BLOCKED_V4.addSubnet(network, prefix, 'ipv4');
}

const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ['::', 96], // unspecified, loopback, IPv4-compatible
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique-local, incl. fd00:ec2::254 (AWS metadata)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, 'ipv6');
}

/**
 * Link-local and cloud-metadata endpoints. Refused even under the dev escape hatch: no development receiver lives
 * there, and they hand out the host's cloud credentials.
 */
const METADATA_V4 = new BlockList();
METADATA_V4.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local, AWS / GCP / Azure metadata at 169.254.169.254
METADATA_V4.addAddress('100.100.100.200', 'ipv4'); // Alibaba Cloud metadata
const METADATA_V6 = new BlockList();
METADATA_V6.addSubnet('fe80::', 10, 'ipv6'); // link-local
METADATA_V6.addAddress('fd00:ec2::254', 'ipv6'); // AWS metadata over IPv6
const METADATA_NAME = /^metadata(\.google\.internal)?$/i;

/** Names that resolve inside the platform's own network whatever DNS says. */
const INTERNAL_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

const UNSAFE_TARGET_CODE = 'EUNSAFETARGET';

/** The eight 16-bit groups of an IPv6 address (handles `::` and a trailing dotted IPv4). */
function ipv6Groups(address: string): number[] {
  let text = address;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number);
    text = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const parse = (part: string | undefined) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const left = parse(head);
  const right = parse(tail);
  const fill = tail === undefined ? [] : new Array<number>(8 - left.length - right.length).fill(0);
  return [...left, ...fill, ...right];
}

/** The IPv4 address an IPv6 address carries, for the forms that route to it (mapped, NAT64, 6to4). */
function embeddedIpv4(groups: number[]): string | null {
  const v4 = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  const zeros = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  if (zeros(0, 5) && groups[5] === 0xffff) return v4(groups[6], groups[7]); // ::ffff:a.b.c.d (mapped)
  if (zeros(0, 4) && groups[4] === 0xffff && groups[5] === 0) return v4(groups[6], groups[7]); // ::ffff:0:a.b.c.d (SIIT)
  if (zeros(0, 6)) return v4(groups[6], groups[7]); // ::a.b.c.d (IPv4-compatible; :: and ::1 map to 0.0.0.x)
  if (groups[0] === 0x64 && groups[1] === 0xff9b && zeros(2, 6)) return v4(groups[6], groups[7]); // 64:ff9b::/96
  if (groups[0] === 0x2002) return v4(groups[1], groups[2]); // 6to4
  return null;
}

export interface WebhookTargetOptions {
  /**
   * Development escape hatch: allow http and private / loopback targets (a receiver on localhost). Link-local and
   * cloud-metadata addresses stay blocked. Never true in production.
   */
  allowPrivate?: boolean;
}

/**
 * True when an outbound request must never reach this address. Anything that is not an IP is refused too. Under
 * `allowPrivate` only link-local and metadata addresses are refused.
 */
export function isBlockedAddress(raw: string, { allowPrivate = false }: WebhookTargetOptions = {}): boolean {
  const address = raw.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  switch (isIP(address)) {
    case 4:
      return (allowPrivate ? METADATA_V4 : BLOCKED_V4).check(address, 'ipv4');
    case 6: {
      const embedded = embeddedIpv4(ipv6Groups(address));
      if (embedded) return isBlockedAddress(embedded, { allowPrivate });
      return (allowPrivate ? METADATA_V6 : BLOCKED_V6).check(address, 'ipv6');
    }
    default:
      return true;
  }
}

interface UrlCheckOptions extends WebhookTargetOptions {
  /** New and edited URLs must be https. A delivery to an http URL saved before that rule still goes out. */
  requireHttps: boolean;
}

/** Why a URL is not a safe webhook target, or null. Shared by the save-time and send-time checks. */
function unsafeReason(url: string, { allowPrivate = false, requireHttps }: UrlCheckOptions): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'is not a valid URL';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return allowPrivate ? 'must use http or https' : 'must use https';
  // A trailing dot is the same DNS name ("localhost." is localhost).
  const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (allowPrivate) {
    if (METADATA_NAME.test(host) || (isIP(host) && isBlockedAddress(host, { allowPrivate }))) {
      return 'names a link-local or cloud metadata address';
    }
    return null;
  }
  if (requireHttps && parsed.protocol !== 'https:') return 'must use https';
  if (isIP(host)) return isBlockedAddress(host) ? 'names a private, loopback or link-local address' : null;
  if (INTERNAL_NAME.test(host) || !host.includes('.')) return 'names a host inside a private network';
  return null;
}

function unsafeUrlException(reason: string): BadRequestException {
  return new BadRequestException(
    `The webhook URL ${reason}. Webhook URLs must be public HTTPS addresses; private, loopback and cloud metadata addresses are refused.`,
  );
}

/**
 * Save-time check of the URL text alone: public https, not a blocked address, not an internal host name.
 * `assertSafeWebhookTarget` adds the check of what the host resolves to; use that when saving a subscription.
 */
export function assertSafeWebhookUrl(url: string, options: WebhookTargetOptions = {}): void {
  const reason = unsafeReason(url, { ...options, requireHttps: true });
  if (reason) throw unsafeUrlException(reason);
}

type Resolver = (
  hostname: string,
  options: LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

export interface WebhookResolveOptions extends WebhookTargetOptions {
  /** The DNS resolver; `dns.lookup` unless a test supplies one. */
  resolve?: Resolver;
}

/**
 * Save-time check (create / update a subscription): the URL passes `assertSafeWebhookUrl` AND every address its
 * host resolves to right now is public. A host that does not resolve is refused, because nothing about it can be
 * checked. Throws a 400.
 */
export async function assertSafeWebhookTarget(url: string, options: WebhookResolveOptions = {}): Promise<void> {
  assertSafeWebhookUrl(url, options);
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;

  const resolve: Resolver = options.resolve ?? (dnsLookup as unknown as Resolver);
  const addresses = await new Promise<LookupAddress[] | null>((done) =>
    resolve(host, { all: true }, (err, found) => done(err ? null : found)),
  );
  if (!addresses || addresses.length === 0) throw unsafeUrlException('names a host that could not be resolved');
  if (addresses.some((entry) => isBlockedAddress(entry.address, options))) {
    throw unsafeUrlException('resolves to a private, loopback or link-local address');
  }
}

/** A delivery refused because its target is (or resolves to) a blocked address. Not retryable. */
export class UnsafeWebhookTargetError extends Error {
  readonly code = UNSAFE_TARGET_CODE;

  /** `reason` completes "The webhook URL …", e.g. "must use https". */
  constructor(reason: string) {
    super(`The webhook URL ${reason}`);
    this.name = 'UnsafeWebhookTargetError';
  }
}

/** True for an `UnsafeWebhookTargetError`, including when an HTTP client wrapped it (axios copies `code`, sets `cause`). */
export function isUnsafeWebhookTargetError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return code === UNSAFE_TARGET_CODE || (cause !== undefined && isUnsafeWebhookTargetError(cause));
}

/** Send-time check of the URL itself (an IP-literal host never goes through DNS, so the lookup cannot catch it). */
export function assertDeliverableWebhookUrl(url: string, options: WebhookTargetOptions = {}): void {
  const reason = unsafeReason(url, { ...options, requireHttps: false });
  if (reason) throw new UnsafeWebhookTargetError(reason);
}

/**
 * A `net` lookup that resolves every address of the host and refuses the connection if ANY is blocked. Because the
 * socket connects to the address this function returns, a DNS answer that changes between check and connect cannot
 * slip through.
 */
export function createSafeLookup(options: WebhookResolveOptions = {}): LookupFunction {
  const resolve: Resolver = options.resolve ?? (dnsLookup as unknown as Resolver);
  return (hostname, lookupOptions, callback) => {
    resolve(hostname, { ...lookupOptions, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const blocked = addresses.find((entry) => isBlockedAddress(entry.address, options));
      if (blocked) {
        return callback(new UnsafeWebhookTargetError(`resolves to a non-public address (${blocked.address})`), '', 0);
      }
      if (addresses.length === 0) return callback(new Error(`No address found for ${hostname}`), '', 0);
      if (lookupOptions.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/** HTTP(S) agents whose every connection goes through `createSafeLookup`. Pass to the HTTP client per request. */
export function createSafeWebhookAgents(options: WebhookResolveOptions = {}): {
  httpAgent: HttpAgent;
  httpsAgent: HttpsAgent;
} {
  const lookup = createSafeLookup(options);
  return { httpAgent: new HttpAgent({ lookup }), httpsAgent: new HttpsAgent({ lookup }) };
}
