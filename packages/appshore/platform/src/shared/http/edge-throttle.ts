/**
 * A high but finite throttle for traffic that arrives in bursts from a few addresses and is authenticated by
 * something other than a session: signed vendor webhooks (Stripe, Meta), MCP clients holding an API key or an
 * OAuth token, OAuth discovery and consent, and the dev-only QA levers.
 *
 * `@SkipThrottle()` is for health and SSE routes only (`api-contract.spec.ts`, rule
 * `edge/skip-throttle-only-health-sse`): a signed route still spends CPU checking every forged request, so it gets
 * a ceiling, not an exemption.
 */
export const GENEROUS_THROTTLE = { default: { ttl: 60_000, limit: 1000 } } as const;
