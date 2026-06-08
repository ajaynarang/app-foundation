import type { AgentScope } from '@app/shared-types';

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
  ['platform:write', 'platform:read'],
  ['platform:write:sensitive', 'platform:write'],
  ['platform:write:sensitive', 'platform:read'],
  ['documents:write', 'documents:read'],
  ['integrations:write', 'integrations:read'],
  ['integrations:write:sensitive', 'integrations:write'],
  ['integrations:write:sensitive', 'integrations:read'],
  ['comms:send:bulk', 'comms:send'],
];
