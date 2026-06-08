import { z } from 'zod';

/**
 * Normalized agent scope vocabulary. Shape: `domain:action[:sensitive|:bulk]`.
 * Tool authority is derived from the @RequiresScope decorator in the backend; this is the
 * API-layer enum used by OAuth consent screens, API-key mint UI, and Desk responsibility grants.
 */
export const AgentScopeSchema = z.enum([
  'platform:read',
  'platform:write',
  'platform:write:sensitive',
  'comms:send',
  'comms:send:bulk',
  'documents:read',
  'documents:write',
  'integrations:read',
  'integrations:write',
  'integrations:write:sensitive',
  'knowledge:read',
  'platform:admin',
]);
export type AgentScope = z.infer<typeof AgentScopeSchema>;

export const SCOPE_TIERS = {
  READ: 'read',
  STANDARD: 'standard',
  SENSITIVE: 'sensitive',
} as const;
export type ScopeTier = (typeof SCOPE_TIERS)[keyof typeof SCOPE_TIERS];

export function scopeDomain(scope: AgentScope): string {
  return scope.split(':')[0];
}

export function scopeAction(scope: AgentScope): string {
  return scope.split(':').slice(1).join(':');
}

export function scopeTier(scope: AgentScope): ScopeTier {
  if (scope.endsWith(':sensitive') || scope === 'comms:send:bulk' || scope === 'platform:admin') {
    return SCOPE_TIERS.SENSITIVE;
  }
  if (scope.endsWith(':read')) return SCOPE_TIERS.READ;
  return SCOPE_TIERS.STANDARD;
}

/** Scopes that MUST never be granted to a non-user principal (OAuth clients, API keys). Runtime-enforced. */
export const NEVER_EXTERNAL_SCOPES: readonly AgentScope[] = ['platform:admin'] as const;

export interface AgentScopeDescription {
  /** One-line summary shown in the chip tooltip. */
  summary: string;
  /** Plain-English description rendered in the scope-grant preview. Imperative. */
  grantsPlainEnglish: string;
  /** HITL tier — mirrors hitl-policy.service.ts for this scope. */
  hitlTier: 'none' | 'standard' | 'sensitive';
  /** Up to 4 representative tool names that use this scope. */
  sampleTools: string[];
}

/**
 * Single source of truth for human-readable scope copy.
 * - Phase D consumes this in the scope-diff preview on the Desk agent-management tabs.
 * - Phase E will consume the same map for the developer portal.
 * If a new scope is added to AgentScopeSchema, add its entry here too — the test in
 * agent-scopes-descriptions.spec.ts enforces full coverage.
 */
export const SCOPE_DESCRIPTIONS: Record<AgentScope, AgentScopeDescription> = {
  'platform:read': {
    summary: 'Read platform settings and resources',
    grantsPlainEnglish: 'Lets the agent read platform-level settings and resources in your tenant. Read-only.',
    hitlTier: 'none',
    sampleTools: ['get-settings', 'list-resources', 'get-status'],
  },
  'platform:write': {
    summary: 'Update platform settings and resources',
    grantsPlainEnglish:
      'Lets the agent create and update platform-level settings and resources. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['update-settings', 'create-resource', 'update-resource'],
  },
  'platform:write:sensitive': {
    summary: 'Delete and archive platform resources',
    grantsPlainEnglish:
      'Lets the agent delete and archive platform resources. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['delete-resource', 'archive-resource'],
  },
  'comms:send': {
    summary: 'Message a single recipient',
    grantsPlainEnglish:
      'Lets the agent send a message to a single recipient. Requires a one-time confirm for each send.',
    hitlTier: 'standard',
    sampleTools: ['send-message', 'send-email'],
  },
  'comms:send:bulk': {
    summary: 'Message many recipients in one shot',
    grantsPlainEnglish:
      'Lets the agent send one message to many recipients at once. Each bulk send requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['send-bulk-message'],
  },
  'documents:read': {
    summary: 'Read documents',
    grantsPlainEnglish: 'Lets the agent look up documents and their metadata. Read-only.',
    hitlTier: 'none',
    sampleTools: ['get-document', 'list-documents'],
  },
  'documents:write': {
    summary: 'Upload and update documents',
    grantsPlainEnglish: 'Lets the agent upload and update documents. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['upload-document', 'update-document'],
  },
  'integrations:read': {
    summary: 'Read integration state',
    grantsPlainEnglish: 'Lets the agent check which integrations are connected and their sync state. Read-only.',
    hitlTier: 'none',
    sampleTools: ['list-integrations', 'get-integration-status'],
  },
  'integrations:write': {
    summary: 'Trigger integration sync',
    grantsPlainEnglish: 'Lets the agent trigger a manual integration sync. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['trigger-sync'],
  },
  'integrations:write:sensitive': {
    summary: 'Connect and disconnect integrations',
    grantsPlainEnglish:
      'Lets the agent connect or disconnect integrations. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['connect-integration', 'disconnect-integration'],
  },
  'knowledge:read': {
    summary: 'Read the knowledge base',
    grantsPlainEnglish: 'Lets the agent search and read the knowledge base. Read-only.',
    hitlTier: 'none',
    sampleTools: ['search-knowledge', 'get-article'],
  },
  'platform:admin': {
    summary: 'Platform admin — never granted to external agents',
    grantsPlainEnglish: 'Administrator-only. This scope can never be granted to OAuth clients or API keys.',
    hitlTier: 'sensitive',
    sampleTools: [],
  },
};
