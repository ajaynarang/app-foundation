/**
 * Lightweight client-side UA → label fallback.
 *
 * The server now ships a parsed `deviceLabel` on every event payload, so this
 * helper only fires for hypothetical older rows that lack one. It is intentionally
 * minimal — the canonical parser lives on the backend.
 */
export function parseUaShort(ua: string | null): string {
  if (!ua) return '—';
  if (/iPhone|iPad/.test(ua)) return 'Safari on iOS';
  if (/Android/.test(ua)) return 'Chrome on Android';
  if (/Macintosh/.test(ua)) return 'Browser on macOS';
  if (/Windows/.test(ua)) return 'Browser on Windows';
  return ua.slice(0, 32);
}
