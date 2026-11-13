import { maskEmail, maskPhone } from '../../shared/utils/log-redaction';

export { maskEmail, maskPhone };

/**
 * What an allow-list entry matches. The kernel cannot import the Prisma `OutboundAllowKind` enum; a parity spec in
 * platform (`outbound-allow-kind-parity.spec.ts`) holds these values to it.
 */
export const OUTBOUND_ALLOW_KIND = {
  EMAIL: 'EMAIL',
  EMAIL_DOMAIN: 'EMAIL_DOMAIN',
  PHONE: 'PHONE',
  HOST: 'HOST',
} as const;

export type OutboundAllowKindValue = (typeof OUTBOUND_ALLOW_KIND)[keyof typeof OUTBOUND_ALLOW_KIND];

export interface AllowEntryValue {
  kind: OutboundAllowKindValue;
  value: string;
}

/** The allow-list grouped for constant-time lookups. Values are already normalized. */
export interface AllowSet {
  emails: ReadonlySet<string>;
  emailDomains: readonly string[];
  phones: ReadonlySet<string>;
  hosts: readonly string[];
}

export const EMPTY_ALLOW_SET: AllowSet = { emails: new Set(), emailDomains: [], phones: new Set(), hosts: [] };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Accepts `example.com` or `@example.com`. */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
}

/**
 * Digits with a leading `+`. No country is assumed: a product serves more than one, so a number is expected in E.164
 * form already (the phone flows validate it), and a bare digit run is read as country code plus number.
 */
export function normalizePhone(phone: string): string {
  return `+${phone.replace(/\D/g, '')}`;
}

export function normalizeAllowValue(kind: OutboundAllowKindValue, value: string): string {
  switch (kind) {
    case OUTBOUND_ALLOW_KIND.EMAIL:
      return normalizeEmail(value);
    case OUTBOUND_ALLOW_KIND.PHONE:
      return normalizePhone(value);
    case OUTBOUND_ALLOW_KIND.EMAIL_DOMAIN:
    case OUTBOUND_ALLOW_KIND.HOST:
      return normalizeDomain(value);
  }
}

export function buildAllowSet(entries: readonly AllowEntryValue[]): AllowSet {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const emailDomains: string[] = [];
  const hosts: string[] = [];
  for (const entry of entries) {
    switch (entry.kind) {
      case OUTBOUND_ALLOW_KIND.EMAIL:
        emails.add(entry.value);
        break;
      case OUTBOUND_ALLOW_KIND.PHONE:
        phones.add(entry.value);
        break;
      case OUTBOUND_ALLOW_KIND.EMAIL_DOMAIN:
        emailDomains.push(entry.value);
        break;
      case OUTBOUND_ALLOW_KIND.HOST:
        hosts.push(entry.value);
        break;
    }
  }
  return { emails, emailDomains, phones, hosts };
}

/** Two allow sets as one (the database list and the bootstrap list). */
export function mergeAllowSets(a: AllowSet, b: AllowSet): AllowSet {
  return {
    emails: new Set([...a.emails, ...b.emails]),
    emailDomains: [...a.emailDomains, ...b.emailDomains],
    phones: new Set([...a.phones, ...b.phones]),
    hosts: [...a.hosts, ...b.hosts],
  };
}

/**
 * `OUTBOUND_ALLOWLIST_BOOTSTRAP`: a comma list, each item read by its shape. `@example.com` is an email domain,
 * `a@example.com` an email, a value of digits, spaces, dashes and brackets (with an optional leading `+`) a phone
 * number, anything else a webhook host. Blank items are skipped.
 */
export function parseBootstrapAllowList(raw: string | undefined): AllowEntryValue[] {
  if (!raw) return [];
  const entries: AllowEntryValue[] = [];
  for (const item of raw.split(',')) {
    const value = item.trim();
    if (!value) continue;
    const kind = value.startsWith('@')
      ? OUTBOUND_ALLOW_KIND.EMAIL_DOMAIN
      : value.includes('@')
        ? OUTBOUND_ALLOW_KIND.EMAIL
        : /^\+?[\d\s().-]{6,}$/.test(value)
          ? OUTBOUND_ALLOW_KIND.PHONE
          : OUTBOUND_ALLOW_KIND.HOST;
    entries.push({ kind, value: normalizeAllowValue(kind, value) });
  }
  return entries;
}

/** Exact domain or any subdomain of it: `a.b.com` matches `b.com`, `evilb.com` does not. */
function matchesDomain(candidate: string, domains: readonly string[]): boolean {
  return domains.some((domain) => candidate === domain || candidate.endsWith(`.${domain}`));
}

/** One bare address only: a list or display-name form could smuggle in a second recipient. */
const SINGLE_ADDRESS_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+$/;

export function isEmailAllowed(email: string, allow: AllowSet): boolean {
  const normalized = normalizeEmail(email);
  if (!SINGLE_ADDRESS_PATTERN.test(normalized)) return false;
  if (allow.emails.has(normalized)) return true;
  return matchesDomain(normalized.slice(normalized.lastIndexOf('@') + 1), allow.emailDomains);
}

export function isPhoneAllowed(phone: string, allow: AllowSet): boolean {
  return allow.phones.has(normalizePhone(phone));
}

export function isUrlAllowed(url: string, allow: AllowSet): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return matchesDomain(host, allow.hosts);
}

/** Keeps the host only: paths and query strings can carry tokens. */
export function maskUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '***';
  }
}

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
/** A standalone 4 to 8 digit run (a sign-in code), not part of `INV-2026-0001` or `ORD-1234`. */
const CODE_PATTERN = /(?<![\w-])(?:\d{3}[- ]\d{3}|\d{4,8})(?![\w-])/g;
const EMAIL_PATTERN = /[^\s@<>"'`(),;:[\]]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;

/**
 * The held-back list is readable by super-admins, so a preview never carries something that grants access or names
 * someone: sign-in codes and links (invitation and reset tokens) are replaced, and addresses are masked.
 */
export function redactPreview(text: string): string {
  return text
    .replace(URL_PATTERN, '[link]')
    .replace(EMAIL_PATTERN, (email) => maskEmail(email))
    .replace(CODE_PATTERN, '••••');
}
