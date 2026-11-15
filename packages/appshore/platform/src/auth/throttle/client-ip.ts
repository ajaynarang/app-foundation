/**
 * The caller's IP as Express resolved it under `trust proxy` (the load balancer's X-Forwarded-For hop), with
 * IPv4-mapped IPv6 (`::ffff:203.0.113.7`) folded to plain IPv4 so throttle buckets see one spelling.
 */
export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') && raw.includes('.') ? raw.slice('::ffff:'.length) : raw;
}
