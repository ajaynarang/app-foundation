import type { AgentScope } from '@sally/shared-types';

/**
 * Tool names that are permanently excluded from MCP / external agent exposure.
 * If the scope-registry finds any of these in the discovered tool list, boot fails.
 * See design doc §6 "What is never MCP-exposed".
 */
export const PERMANENTLY_EXCLUDED_TOOL_NAMES: readonly string[] = [
  // admin
  'cache-flush',
  'jobs-schedule',
  'events-replay',
  // auth / oauth bootstrap
  'oauth-authorize',
  'oauth-token',
  // dev-switcher
  'dev-switch',
] as const;

/**
 * Additive implication table: granting a higher-tier scope implies the lower tiers
 * in the same domain. Encoded as pairs of (granted, implied).
 */
export const SCOPE_IMPLICATIONS: ReadonlyArray<[AgentScope, AgentScope]> = [
  ['fleet:write', 'fleet:read'],
  ['fleet:write:sensitive', 'fleet:write'],
  ['fleet:write:sensitive', 'fleet:read'],
  ['loads:write', 'loads:read'],
  ['loads:write:sensitive', 'loads:write'],
  ['loads:write:sensitive', 'loads:read'],
  ['invoices:write', 'invoices:read'],
  ['invoices:write:sensitive', 'invoices:write'],
  ['invoices:write:sensitive', 'invoices:read'],
  ['settlements:write', 'settlements:read'],
  ['settlements:write:sensitive', 'settlements:write'],
  ['settlements:write:sensitive', 'settlements:read'],
  ['customers:write', 'customers:read'],
  ['customers:write:sensitive', 'customers:write'],
  ['customers:write:sensitive', 'customers:read'],
  ['shield:write', 'shield:read'],
  ['documents:write', 'documents:read'],
  ['alerts:write', 'alerts:read'],
  ['integrations:write', 'integrations:read'],
  ['integrations:write:sensitive', 'integrations:write'],
  ['integrations:write:sensitive', 'integrations:read'],
  ['comms:send:bulk', 'comms:send'],
  ['desk:write', 'desk:read'],
  ['desk:write:sensitive', 'desk:write'],
  ['desk:write:sensitive', 'desk:read'],
  ['platform:write', 'platform:read'],
];
