import { z } from 'zod';

/**
 * Normalized agent scope vocabulary. Shape: `domain:action[:sensitive|:bulk]`.
 * Tool authority is derived from the @RequiresScope decorator in the backend; this is the
 * API-layer enum used by OAuth consent screens, API-key mint UI, and Desk responsibility grants.
 */
export const AgentScopeSchema = z.enum([
  'fleet:read',
  'fleet:write',
  'fleet:write:sensitive',
  'loads:read',
  'loads:write',
  'loads:write:sensitive',
  'invoices:read',
  'invoices:write',
  'invoices:write:sensitive',
  'settlements:read',
  'settlements:write',
  'settlements:write:sensitive',
  'customers:read',
  'customers:write',
  'customers:write:sensitive',
  'shield:read',
  'shield:write',
  'documents:read',
  'documents:write',
  'alerts:read',
  'alerts:write',
  'integrations:read',
  'integrations:write',
  'integrations:write:sensitive',
  'comms:send',
  'comms:send:bulk',
  'desk:read',
  'desk:write',
  'desk:write:sensitive',
  'platform:read',
  'platform:write',
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
  'fleet:read': {
    summary: 'Read drivers, vehicles, and the fleet snapshot',
    grantsPlainEnglish: 'Lets the agent look up drivers, vehicles, and the live fleet status. Read-only.',
    hitlTier: 'none',
    sampleTools: ['query-loads', 'get-driver-hos', 'get-fleet-status', 'get-alerts'],
  },
  'fleet:write': {
    summary: 'Update drivers and vehicles',
    grantsPlainEnglish:
      'Lets the agent update driver and vehicle records, and resolve alerts in your tenant. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['driver-create', 'vehicle-update', 'acknowledge-alert', 'resolve-alert'],
  },
  'fleet:write:sensitive': {
    summary: 'Retire vehicles, terminate drivers',
    grantsPlainEnglish:
      'Lets the agent retire vehicles and terminate drivers. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['driver-terminate', 'vehicle-retire'],
  },
  'loads:read': {
    summary: 'Read loads and assignments',
    grantsPlainEnglish: 'Lets the agent look up loads, statuses, and stops. Read-only.',
    hitlTier: 'none',
    sampleTools: ['query-loads', 'get-load-detail', 'get-route-status'],
  },
  'loads:write': {
    summary: 'Create and update loads',
    grantsPlainEnglish:
      'Lets the agent create loads, assign drivers, and update status. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['load-create', 'ratecon-accept', 'plan-route', 'report-delay'],
  },
  'loads:write:sensitive': {
    summary: 'Close-out and reverse delivered loads',
    grantsPlainEnglish:
      'Lets the agent close out loads (once delivery is confirmed) and reverse close-outs. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['list-load-charges-for-closeout', 'approve-for-billing'],
  },
  'invoices:read': {
    summary: 'Read invoices and payments',
    grantsPlainEnglish: 'Lets the agent look up invoices and payment details. Read-only.',
    hitlTier: 'none',
    sampleTools: ['query-invoices', 'get-invoice-detail', 'get-invoice-summary'],
  },
  'invoices:write': {
    summary: 'Send invoices and record payments',
    grantsPlainEnglish: 'Lets the agent send invoices and record payments. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['send-invoice', 'record-payment', 'generate-invoice'],
  },
  'invoices:write:sensitive': {
    summary: 'Void and factor invoices',
    grantsPlainEnglish:
      'Lets the agent void invoices and submit them for factoring. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['void-invoice', 'factor-invoice'],
  },
  'settlements:read': {
    summary: 'Read driver settlements',
    grantsPlainEnglish: 'Lets the agent look up driver settlements and pay history. Read-only.',
    hitlTier: 'none',
    sampleTools: ['query-settlements', 'get-settlement-detail', 'get-driver-pay-structure'],
  },
  'settlements:write': {
    summary: 'Create driver settlements',
    grantsPlainEnglish: 'Lets the agent create driver settlements. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['settlement-create'],
  },
  'settlements:write:sensitive': {
    summary: 'Approve and reverse settlements',
    grantsPlainEnglish:
      'Lets the agent approve and reverse driver settlements. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['approve-settlement'],
  },
  'customers:read': {
    summary: 'Read customers',
    grantsPlainEnglish: 'Lets the agent look up customers, contacts, and payment stats. Read-only.',
    hitlTier: 'none',
    sampleTools: ['query-customers', 'get-customer-detail', 'get-customer-payment-stats'],
  },
  'customers:write': {
    summary: 'Create and update customers',
    grantsPlainEnglish:
      'Lets the agent create and update customer records. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['customer-create'],
  },
  'customers:write:sensitive': {
    summary: 'Deactivate customers and override credit hold',
    grantsPlainEnglish:
      'Lets the agent deactivate customers and override credit holds. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['customer-deactivate'],
  },
  'shield:read': {
    summary: 'Read Shield compliance findings',
    grantsPlainEnglish: 'Lets the agent read Shield scores and compliance findings. Read-only.',
    hitlTier: 'none',
    sampleTools: ['get-shield-score', 'get-shield-findings'],
  },
  'shield:write': {
    summary: 'Dispute Shield findings and run audits',
    grantsPlainEnglish:
      'Lets the agent dispute Shield findings and trigger compliance audits. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['shield-dispute', 'trigger-shield-audit'],
  },
  'documents:read': {
    summary: 'Read documents and compliance state',
    grantsPlainEnglish: 'Lets the agent look up documents and their compliance state. Read-only.',
    hitlTier: 'none',
    sampleTools: ['get-document-compliance'],
  },
  'documents:write': {
    summary: 'Accept rate-cons and upload documents',
    grantsPlainEnglish:
      'Lets the agent accept parsed rate-confirmations and attach documents. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['ratecon-accept'],
  },
  'alerts:read': {
    summary: 'Read alerts',
    grantsPlainEnglish: 'Lets the agent read alerts raised by the command center and Shield. Read-only.',
    hitlTier: 'none',
    sampleTools: ['get-alerts'],
  },
  'alerts:write': {
    summary: 'Acknowledge and resolve alerts',
    grantsPlainEnglish:
      'Lets the agent acknowledge and resolve operational alerts. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: ['acknowledge-alert', 'resolve-alert'],
  },
  'integrations:read': {
    summary: 'Read integration state',
    grantsPlainEnglish: 'Lets the agent check which integrations (QuickBooks, Samsara, etc.) are connected. Read-only.',
    hitlTier: 'none',
    sampleTools: [],
  },
  'integrations:write': {
    summary: 'Trigger integration sync',
    grantsPlainEnglish: 'Lets the agent trigger a manual integration sync. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: [],
  },
  'integrations:write:sensitive': {
    summary: 'Connect and disconnect integrations',
    grantsPlainEnglish:
      'Lets the agent connect or disconnect integrations (QuickBooks, Samsara, etc.). Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: [],
  },
  'comms:send': {
    summary: 'Message drivers and customers (single)',
    grantsPlainEnglish:
      'Lets the agent send a message to a single driver or customer. Requires a one-time confirm for each send.',
    hitlTier: 'standard',
    sampleTools: ['comms-driver', 'comms-customer'],
  },
  'comms:send:bulk': {
    summary: 'Message many drivers or customers in one shot',
    grantsPlainEnglish:
      'Lets the agent send one message to many drivers or customers at once. Each bulk send requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: ['comms-bulk-drivers'],
  },
  'desk:read': {
    summary: "Read Sally's Desk activity",
    grantsPlainEnglish: 'Lets the agent read Desk episodes, handoffs, and the review inbox. Read-only.',
    hitlTier: 'none',
    sampleTools: [],
  },
  'desk:write': {
    summary: 'Create Desk review items',
    grantsPlainEnglish:
      'Lets the agent create Desk review items for a human to look at. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: [],
  },
  'desk:write:sensitive': {
    summary: 'Enable and disable Desk responsibilities',
    grantsPlainEnglish:
      'Lets the agent enable or disable Desk responsibilities for your tenant. Each call requires you to confirm with your PIN.',
    hitlTier: 'sensitive',
    sampleTools: [],
  },
  'platform:read': {
    summary: 'Read platform settings',
    grantsPlainEnglish: 'Lets the agent read platform-level settings. Read-only.',
    hitlTier: 'none',
    sampleTools: [],
  },
  'platform:write': {
    summary: 'Update platform settings',
    grantsPlainEnglish: 'Lets the agent update platform-level settings. Requires a one-time confirm for each write.',
    hitlTier: 'standard',
    sampleTools: [],
  },
  'platform:admin': {
    summary: 'Platform admin — never granted to external agents',
    grantsPlainEnglish: 'Administrator-only. This scope can never be granted to OAuth clients or API keys.',
    hitlTier: 'sensitive',
    sampleTools: [],
  },
};
