export type EventCategory = 'Platform' | 'Notifications' | 'Integrations' | 'AI' | 'Desk';

export interface EventDefinition {
  readonly key: string;
  readonly constantName: string;
  readonly label: string;
  readonly description: string;
  readonly category: EventCategory;
  readonly visibility: 'external' | 'internal';
  readonly aggregateType: string;
}

/**
 * Generic platform event catalog.
 *
 * The starter ships a minimal set of cross-cutting platform events. Add your
 * own domain events here — each entry derives a `DOMAIN_EVENTS.<constantName>`
 * literal whose value is `key`. Event keys are namespaced `app.<aggregate>.<verb>`;
 * the in-process subscribers listen on the `app.**` wildcard.
 */
export const EVENT_REGISTRY = [
  // ─── Notifications ─────────────────────────────────────────────────
  {
    key: 'app.notification.created',
    constantName: 'NOTIFICATION_CREATED',
    label: 'Notification Created',
    description: 'An in-app/push/sms/email notification is created for a user',
    category: 'Notifications',
    visibility: 'external' as const,
    aggregateType: 'notification',
  },
  {
    key: 'app.notification.sent',
    constantName: 'NOTIFICATION_SENT',
    label: 'Notification Sent',
    description: 'A notification is delivered to a recipient',
    category: 'Notifications',
    visibility: 'internal' as const,
    aggregateType: 'notification',
  },

  // ─── Users / Tenants (Platform) ────────────────────────────────────
  {
    key: 'app.user.created',
    constantName: 'USER_CREATED',
    label: 'User Created',
    description: 'A new user account is created',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'user',
  },
  {
    key: 'app.user.invited',
    constantName: 'USER_INVITED',
    label: 'User Invited',
    description: 'A user invitation is sent',
    category: 'Platform',
    visibility: 'external' as const,
    aggregateType: 'user',
  },
  {
    key: 'app.user.joined',
    constantName: 'USER_JOINED',
    label: 'User Joined',
    description: 'An invited user accepted and joined the tenant',
    category: 'Platform',
    visibility: 'external' as const,
    aggregateType: 'user',
  },
  {
    key: 'app.user.deactivated',
    constantName: 'USER_DEACTIVATED',
    label: 'User Deactivated',
    description: 'A user account is deactivated',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'user',
  },
  {
    key: 'app.tenant.updated',
    constantName: 'TENANT_UPDATED',
    label: 'Tenant Updated',
    description: 'A tenant record or its settings were updated',
    category: 'Platform',
    visibility: 'external' as const,
    aggregateType: 'tenant',
  },

  // ─── Feature Flags / Preferences (internal) ────────────────────────
  {
    key: 'app.feature-flag.toggled',
    constantName: 'FEATURE_FLAG_TOGGLED',
    label: 'Feature Flag Toggled',
    description: 'A feature flag is enabled or disabled',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'feature-flag',
  },
  {
    key: 'app.preferences.updated',
    constantName: 'USER_PREFERENCES_UPDATED',
    label: 'User Preferences Updated',
    description: 'A user updates their preferences',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'preferences',
  },

  // ─── Integrations / Sync ───────────────────────────────────────────
  {
    key: 'app.integration.synced',
    constantName: 'INTEGRATION_SYNCED',
    label: 'Integration Synced',
    description: 'An integration sync job completed for a tenant',
    category: 'Integrations',
    visibility: 'external' as const,
    aggregateType: 'integration',
  },
  {
    key: 'app.sync.started',
    constantName: 'SYNC_STARTED',
    label: 'Sync Started',
    description: 'An integration sync job has started',
    category: 'Integrations',
    visibility: 'internal' as const,
    aggregateType: 'sync',
  },
  {
    key: 'app.sync.completed',
    constantName: 'SYNC_COMPLETED',
    label: 'Sync Completed',
    description: 'An integration sync job completed successfully',
    category: 'Integrations',
    visibility: 'internal' as const,
    aggregateType: 'sync',
  },
  {
    key: 'app.sync.failed',
    constantName: 'SYNC_FAILED',
    label: 'Sync Failed',
    description: 'An integration sync job failed',
    category: 'Integrations',
    visibility: 'internal' as const,
    aggregateType: 'sync',
  },

  // ─── AI (chat + agent runtime) ─────────────────────────────────────
  {
    key: 'app.ai.message',
    constantName: 'AI_MESSAGE',
    label: 'AI Message',
    description: 'A new AI assistant message is produced in a conversation',
    category: 'AI',
    visibility: 'external' as const,
    aggregateType: 'conversation',
  },
  {
    key: 'app.conversation.session-issued',
    constantName: 'CONVERSATION_SESSION_ISSUED',
    label: 'Conversation Session Issued',
    description:
      'An opaque session token is issued for an (anonymous) conversation. Internal audit event; no SSE bridge.',
    category: 'AI',
    visibility: 'internal' as const,
    aggregateType: 'conversation',
  },
  {
    key: 'app.conversation.session-revoked',
    constantName: 'CONVERSATION_SESSION_REVOKED',
    label: 'Conversation Session Revoked',
    description: 'A previously-issued conversation session token is revoked. Internal audit event; no SSE bridge.',
    category: 'AI',
    visibility: 'internal' as const,
    aggregateType: 'conversation',
  },
  {
    key: 'app.ai.invocation-recorded',
    constantName: 'AI_INVOCATION_RECORDED',
    label: 'AI Invocation Recorded',
    description:
      'An LLM or embedding call was recorded to the AiInvocation ledger. Hot-path listeners invalidate per-tenant cost aggregates.',
    category: 'AI',
    visibility: 'internal' as const,
    aggregateType: 'ai-invocation',
  },
  {
    key: 'app.ai.budget-soft-breached',
    constantName: 'AI_BUDGET_SOFT_BREACHED',
    label: 'AI Budget Soft Cap Breached',
    description: "A tenant's AI spend crossed its soft daily or monthly cap. The call still proceeds.",
    category: 'AI',
    visibility: 'internal' as const,
    aggregateType: 'tenant-ai-budget',
  },
  {
    key: 'app.ai.budget-hard-breached',
    constantName: 'AI_BUDGET_HARD_BREACHED',
    label: 'AI Budget Hard Cap Breached',
    description:
      "A tenant's AI spend hit its hard daily or monthly cap. The call is blocked and the surface falls back.",
    category: 'AI',
    visibility: 'internal' as const,
    aggregateType: 'tenant-ai-budget',
  },
  {
    key: 'app.ai.zero-retention-unavailable',
    constantName: 'AI_ZERO_RETENTION_UNAVAILABLE',
    label: 'AI Zero-Retention Route Unavailable',
    description:
      'A tenant requires zero-data-retention AI routing but no ZDR-eligible model is configured for the requested tier.',
    category: 'AI',
    visibility: 'internal' as const,
    aggregateType: 'tenant',
  },

  // ─── Agent Contract ────────────────────────────────────────────────
  {
    key: 'app.agent.invocation-completed',
    constantName: 'AGENT_INVOCATION_COMPLETED',
    label: 'Agent Invocation Completed',
    description: 'An agent tool invocation finished (success or failure). Carries redacted args.',
    category: 'AI',
    visibility: 'external' as const,
    aggregateType: 'agent-invocation',
  },
  {
    key: 'app.agent.hitl-challenge-issued',
    constantName: 'AGENT_HITL_CHALLENGE_ISSUED',
    label: 'Agent HITL Challenge Issued',
    description: 'A third-party principal hit a standard or sensitive tier tool; a challenge token was issued.',
    category: 'AI',
    visibility: 'external' as const,
    aggregateType: 'agent-invocation',
  },
  {
    key: 'app.agent.hitl-challenge-completed',
    constantName: 'AGENT_HITL_CHALLENGE_COMPLETED',
    label: 'Agent HITL Challenge Completed',
    description: 'A HITL challenge token was re-presented within TTL (and step-up OTP verified for sensitive tier).',
    category: 'AI',
    visibility: 'external' as const,
    aggregateType: 'agent-invocation',
  },

  // ─── API Keys ──────────────────────────────────────────────────────
  {
    key: 'app.api-key.rotated',
    constantName: 'API_KEY_ROTATED',
    label: 'API Key Rotated',
    description: 'An API key was rotated — the old key is revoked and a new plaintext key was returned once.',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'app.api-key.revoked',
    constantName: 'API_KEY_REVOKED',
    label: 'API Key Revoked',
    description: 'An API key was revoked; further calls with that key will fail.',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'app.api-key.scopes-updated',
    constantName: 'API_KEY_SCOPES_UPDATED',
    label: 'API Key Scopes Updated',
    description: 'The scopes (or IP allowlist / rate limit) on an API key were updated.',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'app.api-key.paused',
    constantName: 'API_KEY_PAUSED',
    label: 'API Key Paused',
    description: 'An API key was temporarily paused (isActive=false); can be resumed.',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },
  {
    key: 'app.api-key.resumed',
    constantName: 'API_KEY_RESUMED',
    label: 'API Key Resumed',
    description: 'A paused API key was resumed (isActive=true).',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'api-key',
  },

  // ─── OAuth Clients ─────────────────────────────────────────────────
  {
    key: 'app.oauth-client.rotated',
    constantName: 'OAUTH_CLIENT_ROTATED',
    label: 'OAuth Client Secret Rotated',
    description:
      'An OAuth client secret was rotated. Existing access/refresh tokens are not cascaded (OAuth 2.1 convention).',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'app.oauth-client.revoked',
    constantName: 'OAUTH_CLIENT_REVOKED',
    label: 'OAuth Client Revoked',
    description: 'An OAuth client was revoked. Active access + refresh tokens were cascaded-revoked.',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'app.oauth-client.scopes-updated',
    constantName: 'OAUTH_CLIENT_SCOPES_UPDATED',
    label: 'OAuth Client Scopes Updated',
    description: 'The grantable scope set on an OAuth client was updated.',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'app.oauth-client.paused',
    constantName: 'OAUTH_CLIENT_PAUSED',
    label: 'OAuth Client Paused',
    description: 'An OAuth client was paused (isActive=false); can be resumed.',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },
  {
    key: 'app.oauth-client.resumed',
    constantName: 'OAUTH_CLIENT_RESUMED',
    label: 'OAuth Client Resumed',
    description: 'A paused OAuth client was resumed (isActive=true).',
    category: 'Platform',
    visibility: 'internal' as const,
    aggregateType: 'oauth-client',
  },

  // ─── Desk (optional workflow engine) ───────────────────────────────
  {
    key: 'app.desk.episode-changed',
    constantName: 'DESK_EPISODE_CHANGED',
    label: 'Desk Episode Changed',
    description:
      'A desk episode opened, closed, or was resolved — invalidates the Needs-you + Handled lists and handoff counts.',
    category: 'Desk',
    visibility: 'internal' as const,
    aggregateType: 'desk-episode',
  },
  {
    key: 'app.desk.episode-snoozed',
    constantName: 'DESK_EPISODE_SNOOZED',
    label: 'Desk Episode Snoozed',
    description:
      'An operator snoozed a desk episode — the matching entity suppression blocks new episodes on the same (responsibility, entity) tuple until the window elapses.',
    category: 'Desk',
    visibility: 'internal' as const,
    aggregateType: 'desk-episode',
  },
  {
    key: 'app.desk.suppression-cleared',
    constantName: 'DESK_SUPPRESSION_CLEARED',
    label: 'Desk Suppression Cleared',
    description: 'An operator un-snoozed a desk entity suppression — the next scheduled sweep may re-open an episode.',
    category: 'Desk',
    visibility: 'internal' as const,
    aggregateType: 'desk-suppression',
  },
] as const satisfies readonly EventDefinition[];

// ─── Lookup Helpers ──────────────────────────────────────────────────

const registryMap = new Map<string, EventDefinition>(EVENT_REGISTRY.map((e) => [e.key, e]));

export function getEventDefinition(key: string): EventDefinition | undefined {
  return registryMap.get(key);
}

export function getExternalEvents(): EventDefinition[] {
  return EVENT_REGISTRY.filter((e) => e.visibility === 'external');
}

export interface EventCatalogCategory {
  label: EventCategory;
  events: {
    name: string;
    label: string;
    description: string;
  }[];
}

export function getExternalEventsByCategory(): EventCatalogCategory[] {
  const categoryMap = new Map<EventCategory, EventCatalogCategory>();

  for (const def of EVENT_REGISTRY) {
    if (def.visibility === 'internal') continue;

    let cat = categoryMap.get(def.category);
    if (!cat) {
      cat = { label: def.category, events: [] };
      categoryMap.set(def.category, cat);
    }
    cat.events.push({
      name: def.key,
      label: def.label,
      description: def.description,
    });
  }

  return Array.from(categoryMap.values());
}
