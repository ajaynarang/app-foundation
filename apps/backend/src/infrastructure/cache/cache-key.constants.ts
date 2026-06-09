/**
 * Cache key utilities.
 *
 * Build a cache key from namespace + parts:
 *   buildKey('app:flags', 'enabled', 'shield') → 'app:flags:enabled:shield'
 */
export function buildKey(namespace: string, ...parts: (string | number)[]): string {
  const segments = [namespace, ...parts];
  for (const seg of segments) {
    if (seg === undefined || seg === null || seg === '') {
      throw new Error(`buildKey: empty segment in key [${segments.join(', ')}]`);
    }
  }
  return segments.join(':');
}
