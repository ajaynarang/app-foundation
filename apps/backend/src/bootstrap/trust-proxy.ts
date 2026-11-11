/**
 * Express `trust proxy` for the edge in front of the API. Without it `req.ip` is the load balancer's address, so
 * the throttle counts every client as one and the API-key IP allowlist checks the load balancer, not the caller.
 *
 * The shipped infrastructure runs production behind exactly one load balancer (infra/terraform/alb.tf), which
 * appends the caller to `X-Forwarded-For`: trust that one hop. Elsewhere trust nothing; with no proxy in front, a
 * client could otherwise write its own `X-Forwarded-For` and pick its throttle bucket.
 *
 * `TRUST_PROXY` (config `edge.trustProxy`) overrides: a hop count (`1`, or `2` with a CDN in front), `false`/`0`,
 * or Express's subnet list (`loopback, 10.0.0.0/8`). `true` (trust every hop, so any client can spoof its IP) is
 * refused.
 */
export type TrustProxySetting = false | number | string;

export function resolveTrustProxy(value: string | undefined, environment: string | undefined): TrustProxySetting {
  const raw = value?.trim();
  if (!raw) return environment === 'production' ? 1 : false;
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true') {
    throw new Error(
      'TRUST_PROXY=true trusts every X-Forwarded-For hop, so any client can choose its own IP. Set the hop count (1 behind one load balancer).',
    );
  }
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** Applies the setting to the Express app, before any request is served. */
export function applyTrustProxy(
  app: { set(setting: string, value: unknown): unknown },
  value: string | undefined,
  environment: string | undefined,
): TrustProxySetting {
  const setting = resolveTrustProxy(value, environment);
  app.set('trust proxy', setting);
  return setting;
}
