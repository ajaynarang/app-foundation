/**
 * Cache TTL constants used across all backend services.
 *
 * All values are in MILLISECONDS — that's what `SallyCacheService.set(key, value, ttlMs)`
 * expects (it forwards to `redis.set(... 'PX', ttlMs)`).
 *
 * Tier guide:
 *   HOT   (15-60s)  — real-time data, event-invalidated
 *   WARM  (2-10min) — operational data, mutation-invalidated
 *   COLD  (10-30min)— config data, rarely changes
 *   FROZEN (1h+)    — reference data, nearly static
 *
 * See .docs/technical/caching-architecture.md for full documentation.
 */

// ---------------------------------------------------------------------------
// Tiered TTL constants (milliseconds)
// ---------------------------------------------------------------------------

// HOT tier (15-60s) — real-time, event-invalidated
export const CACHE_TTL_HOT_15S = 15_000;
export const CACHE_TTL_HOT_30S = 30_000;
export const CACHE_TTL_HOT_60S = 60_000;

// WARM tier (2-10 min) — operational, mutation-invalidated
export const CACHE_TTL_WARM_2M = 120_000;
export const CACHE_TTL_WARM_5M = 300_000;
export const CACHE_TTL_WARM_10M = 600_000;

// COLD tier (10-30 min) — config, rarely changes
export const CACHE_TTL_COLD_10M = 600_000;
export const CACHE_TTL_COLD_30M = 1_800_000;

// FROZEN tier (1h+) — reference data
export const CACHE_TTL_FROZEN_1H = 3_600_000;
export const CACHE_TTL_FROZEN_24H = 86_400_000;

// ---------------------------------------------------------------------------
// Cache namespaces for admin flush
// ---------------------------------------------------------------------------

export const CACHE_NAMESPACES = [
  'sally:plans',
  'sally:addons',
  'sally:cmdcenter',
  'sally:analytics',
  'sally:alerts',
  'sally:eld',
  'sally:monitoring',
  'sally:health',
  'sally:oauth',
  'sally:loadboard',
  'sally:flags',
  'sally:dispatch',
  'sally:profitability',
  'sally:prefs',
  'sally:onboarding',
  'sally:closeout',
  'sally:invoicing',
  'sally:shield',
  'sally:notifications',
  'sally:settings',
  'sally:reference',
  'sally:loads',
  'sally:tenants',
  'sally:announcements',
  'sally:customers',
  'sally:custom-fields',
  'sally:home',
  'sally:desk',
  'sally:tower',
  'sally:agent',
  'sally:comms',
  'sally:ai-telemetry',
] as const;

export type CacheNamespace = (typeof CACHE_NAMESPACES)[number];

/**
 * Tower v3 cache namespace. Tower cache families (`active-loads`, `wire`,
 * `last-risk-band`) key off this prefix. Exposed as a named constant so
 * `buildKey()` callers and the cache-invalidation subscriber's prefix flush
 * share one source of truth instead of scattering the literal.
 */
export const TOWER_CACHE_NAMESPACE: CacheNamespace = 'sally:tower';
