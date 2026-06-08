import type { AgentScope } from '@app/shared-types';

export type TrustTier = 'first_party' | 'third_party';

export type UserPrincipal = {
  kind: 'user';
  userId: number;
  tenantId: number;
  role: string;
  scopes: AgentScope[];
  authMethod: 'jwt';
  auditId: string;
};

export type OAuthClientPrincipal = {
  kind: 'oauth_client';
  clientId: string;
  tenantId: number;
  onBehalfOfUserId: number;
  scopes: AgentScope[];
  authMethod: 'oauth';
  auditId: string;
};

export type ApiKeyPrincipal = {
  kind: 'api_key';
  apiKeyId: number;
  tenantId: number;
  userId: number;
  scopes: AgentScope[];
  ipAllowlist?: string[];
  authMethod: 'api_key';
  auditId: string;
};

export type DeskResponsibilityPrincipal = {
  kind: 'desk_responsibility';
  responsibilityId: number;
  tenantId: number;
  scopes: AgentScope[];
  enabledByUserId: number;
  authMethod: 'desk';
  auditId: string;
};

export type AgentPrincipal = UserPrincipal | OAuthClientPrincipal | ApiKeyPrincipal | DeskResponsibilityPrincipal;

export function fromUser(input: {
  userId: number;
  tenantId: number;
  role: string;
  scopes?: AgentScope[];
}): UserPrincipal {
  assertDbId(input.userId, 'fromUser.userId');
  assertDbId(input.tenantId, 'fromUser.tenantId');
  return {
    kind: 'user',
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    scopes: input.scopes ?? [],
    authMethod: 'jwt',
    auditId: `user:${input.userId}`,
  };
}

export function fromOAuthUser(input: {
  onBehalfOfUserDbId: number;
  tenantDbId: number;
  role: string;
  scopes: AgentScope[];
  clientId: string;
}): OAuthClientPrincipal {
  assertDbId(input.onBehalfOfUserDbId, 'fromOAuthUser.onBehalfOfUserDbId');
  assertDbId(input.tenantDbId, 'fromOAuthUser.tenantDbId');
  return {
    kind: 'oauth_client',
    clientId: input.clientId,
    tenantId: input.tenantDbId,
    onBehalfOfUserId: input.onBehalfOfUserDbId,
    scopes: input.scopes,
    authMethod: 'oauth',
    auditId: `oauth:${input.clientId}`,
  };
}

export function fromApiKey(input: {
  apiKeyId: number;
  tenantId: number;
  userId: number;
  scopes: AgentScope[];
  ipAllowlist?: string[];
}): ApiKeyPrincipal {
  assertDbId(input.apiKeyId, 'fromApiKey.apiKeyId');
  assertDbId(input.tenantId, 'fromApiKey.tenantId');
  assertDbId(input.userId, 'fromApiKey.userId');
  return {
    kind: 'api_key',
    apiKeyId: input.apiKeyId,
    tenantId: input.tenantId,
    userId: input.userId,
    scopes: input.scopes,
    ipAllowlist: input.ipAllowlist,
    authMethod: 'api_key',
    auditId: `apikey:${input.apiKeyId}`,
  };
}

export function fromDeskResponsibility(input: {
  responsibilityId: number;
  tenantId: number;
  scopes: AgentScope[];
  enabledByUserId: number;
}): DeskResponsibilityPrincipal {
  assertDbId(input.responsibilityId, 'fromDeskResponsibility.responsibilityId');
  assertDbId(input.tenantId, 'fromDeskResponsibility.tenantId');
  assertDbId(input.enabledByUserId, 'fromDeskResponsibility.enabledByUserId');
  return {
    kind: 'desk_responsibility',
    responsibilityId: input.responsibilityId,
    tenantId: input.tenantId,
    scopes: input.scopes,
    enabledByUserId: input.enabledByUserId,
    authMethod: 'desk',
    auditId: `desk:${input.responsibilityId}`,
  };
}

/**
 * Guard against string/NaN/undefined slipping into a DB-id field. The `from*`
 * factories used to silently coerce with `Number(...)`, which turned a JWT
 * `sub` like "user_demo_owner" into `NaN` and wrote `user:NaN` into the audit
 * log. Fail loud at construction instead so the real resolution bug surfaces
 * at the caller, not in telemetry.
 */
function assertDbId(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    let received: string;
    if (value === null || value === undefined) {
      received = value === null ? 'null' : 'undefined';
    } else if (typeof value === 'number' || typeof value === 'string') {
      received = String(value);
    } else {
      try {
        received = JSON.stringify(value);
      } catch {
        received = Object.prototype.toString.call(value);
      }
    }
    throw new Error(
      `${label} must be a positive integer DB id; received ${received}. ` +
        `The caller is passing a wire-format string (e.g. JWT sub) — resolve it ` +
        `to the numeric DB id first (see BaseTenantController.getUserDbId / getTenantDbId).`,
    );
  }
}

export function principalTrustTier(p: AgentPrincipal): TrustTier {
  return p.kind === 'user' || p.kind === 'desk_responsibility' ? 'first_party' : 'third_party';
}

export function principalAuditLabel(p: AgentPrincipal): string {
  return p.auditId;
}
