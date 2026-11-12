/** Longest provider reason kept: enough to read, never a whole response body. */
const MAX_DETAIL_CHARS = 1000;

/**
 * Strip the exact secret, and anything shaped like an `sk-…` key, from provider error text before it is stored on a
 * credential row, logged or returned to a client. A failed test must never echo the pasted key back. The result is
 * capped in length.
 */
export function redactSecret(text: string, secret?: string): string {
  let out = text;
  if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, '[redacted]');
  return out.length > MAX_DETAIL_CHARS ? `${out.slice(0, MAX_DETAIL_CHARS - 1)}…` : out;
}
