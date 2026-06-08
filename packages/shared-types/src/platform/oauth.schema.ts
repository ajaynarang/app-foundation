import { z } from 'zod';

// ── Scopes ──────────────────────────────────────────────
export const OAUTH_SCOPES = [
  // Fleet
  'fleet:read',
  'fleet:write',
  'fleet:write:sensitive',
  // Loads
  'loads:read',
  'loads:write',
  'loads:write:sensitive',
  // Invoices
  'invoices:read',
  'invoices:write',
  'invoices:write:sensitive',
  // Settlements
  'settlements:read',
  'settlements:write',
  'settlements:write:sensitive',
  // Customers
  'customers:read',
  'customers:write',
  'customers:write:sensitive',
  // Billing
  'billing:read',
  'billing:write',
  // Shield (compliance)
  'shield:read',
  'shield:write',
  // Documents
  'documents:read',
  'documents:write',
  // Alerts
  'alerts:read',
  'alerts:write',
  // Integrations (EDI etc.)
  'integrations:read',
  'integrations:write',
  'integrations:write:sensitive',
  // Outbound comms (single + bulk)
  'comms:send',
  'comms:send:bulk',
  // EXCLUDED (deliberate, not an oversight):
  //   desk:*        — internal agent orchestration; external agents should
  //                   not be able to enable/disable other Sally agents.
  //   platform:*    — tenant config, billing, invites; UI-only.
  //   platform:admin — never grantable to any non-user principal.
] as const;

export const OAuthScopeSchema = z.enum(OAUTH_SCOPES);
export type OAuthScope = z.infer<typeof OAuthScopeSchema>;

// ── Client Registration ─────────────────────────────────
export const CreateOAuthClientSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  redirectUris: z.array(z.string().url()).min(1),
  scopes: z.array(OAuthScopeSchema).min(1),
  clientType: z.enum(['confidential', 'public']).default('confidential'),
});

export const UpdateOAuthClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  redirectUris: z.array(z.string().url()).min(1).optional(),
  scopes: z.array(OAuthScopeSchema).min(1).optional(),
});

export const OAuthClientResponseSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  redirectUris: z.array(z.string()),
  scopes: z.array(z.string()),
  clientType: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export const OAuthClientCreatedResponseSchema = OAuthClientResponseSchema.extend({
  clientSecret: z.string(),
});

export type CreateOAuthClientInput = z.infer<typeof CreateOAuthClientSchema>;
export type UpdateOAuthClientInput = z.infer<typeof UpdateOAuthClientSchema>;
export type OAuthClientResponse = z.infer<typeof OAuthClientResponseSchema>;
export type OAuthClientCreatedResponse = z.infer<typeof OAuthClientCreatedResponseSchema>;

// ── Authorization Request ───────────────────────────────
export const AuthorizationRequestSchema = z.object({
  responseType: z.literal('code'),
  clientId: z.string(),
  redirectUri: z.string().url(),
  scope: z.string(),
  state: z.string().min(1),
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: z.literal('S256'),
});

export type AuthorizationRequest = z.infer<typeof AuthorizationRequestSchema>;

// ── Token Request ───────────────────────────────────────
export const TokenRequestSchema = z.discriminatedUnion('grantType', [
  z.object({
    grantType: z.literal('authorization_code'),
    code: z.string(),
    redirectUri: z.string().url(),
    clientId: z.string(),
    clientSecret: z.string().optional(),
    codeVerifier: z.string().min(43).max(128),
  }),
  z.object({
    grantType: z.literal('refresh_token'),
    refreshToken: z.string(),
    clientId: z.string(),
    clientSecret: z.string().optional(),
  }),
]);

export type TokenRequest = z.infer<typeof TokenRequestSchema>;

// ── Token Response ──────────────────────────────────────
export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number(),
  refreshToken: z.string(),
  scope: z.string(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

// ── Consent Challenge ───────────────────────────────────
export const ConsentChallengeSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  clientDescription: z.string().nullable(),
  requestedScopes: z.array(z.string()),
  redirectUri: z.string(),
  state: z.string(),
  codeChallenge: z.string(),
  codeChallengeMethod: z.string(),
});

export type ConsentChallenge = z.infer<typeof ConsentChallengeSchema>;

// ── Scope Descriptions (for consent page) ───────────────
export const OAUTH_SCOPE_DESCRIPTIONS: Record<string, string> = {
  // Fleet
  'fleet:read': 'View fleet data (drivers, vehicles, trailers)',
  'fleet:write': 'Create and update drivers, vehicles, and trailers',
  'fleet:write:sensitive': 'Terminate drivers, retire vehicles (requires PIN approval)',
  // Loads
  'loads:read': 'View loads, stops, and dispatch board',
  'loads:write': 'Create, assign, and update loads',
  'loads:write:sensitive': 'Cancel or void loads (requires PIN approval)',
  // Invoices
  'invoices:read': 'View invoices and AR aging',
  'invoices:write': 'Create and send invoices',
  'invoices:write:sensitive': 'Void invoices (requires PIN approval)',
  // Settlements
  'settlements:read': 'View settlements and driver pay',
  'settlements:write': 'Create and approve settlements',
  'settlements:write:sensitive': 'Void approved settlements (requires PIN approval)',
  // Customers
  'customers:read': 'View customer information',
  'customers:write': 'Create and update customers',
  'customers:write:sensitive': 'Deactivate customers (requires PIN approval)',
  // Billing
  'billing:read': 'View billing readiness and charges',
  'billing:write': 'Approve loads for billing',
  // Shield (compliance)
  'shield:read': 'View compliance scores and findings',
  'shield:write': 'Dispute compliance findings',
  // Documents
  'documents:read': 'View document compliance status',
  'documents:write': 'Upload load documents (BOL, POD, rate-con)',
  // Alerts
  'alerts:read': 'View operational alerts',
  'alerts:write': 'Acknowledge, resolve, and create alerts',
  // Integrations (EDI etc.)
  'integrations:read': 'View EDI tenders and trading partners',
  'integrations:write': 'Accept, decline, or counter EDI tenders',
  'integrations:write:sensitive': 'Manage auto-accept rules (requires PIN approval)',
  // Outbound comms
  'comms:send': 'Send messages to a single driver or customer',
  'comms:send:bulk': 'Send bulk broadcasts to many recipients',
};
