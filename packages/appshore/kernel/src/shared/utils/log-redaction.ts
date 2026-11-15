/**
 * Masking for values that must never reach logs, traces or error trackers in
 * full. Once a product ships logs to a vendor (Grafana Cloud, see
 * docs/standards/observability.md), a phone, an email or a token in a log line
 * is a copy of it held by a third party.
 */

/** `Ops@Example.COM` → `o***@example.com`. Anything without a local part → `***`. */
export function maskEmail(email: string | null | undefined): string {
  const normalized = (email ?? '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${normalized[0]}***${normalized.slice(at)}`;
}

/** `+19785551234` → `***1234`. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return `***${digits.slice(-4)}`;
}

/**
 * `/api/v1/sse/stream?token=eyJ…` → `/api/v1/sse/stream`. The whole query string
 * goes, not just `token=`: invite links, OAuth callbacks and signed URLs carry
 * secrets under other names too.
 */
export function stripQueryString(url: string | null | undefined): string {
  if (!url) return '';
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * The local part excludes `/` and `\` and the domain must look like a hostname,
 * so scoped package paths in stack frames (`/node_modules/@nestjs/core/…`,
 * `.pnpm/@prisma+client@7.3.0/…`) are never mistaken for an address.
 */
const EMAIL_IN_TEXT = /[^\s@<>"'`(),;:[\]/\\]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
/** E.164 only — a bare digit run is far more often an id, a timestamp or a byte count. */
const E164_IN_TEXT = /\+\d{10,15}\b/g;

/**
 * Masks emails and E.164 phones inside free text: provider error messages
 * (Twilio, Resend, SMTP) echo the recipient, so an error logged with its
 * message or stack would otherwise carry it.
 */
export function scrubContactDetails(text: string): string {
  return text.replace(EMAIL_IN_TEXT, (email) => maskEmail(email)).replace(E164_IN_TEXT, (phone) => maskPhone(phone));
}
