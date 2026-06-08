import { z } from 'zod';

// ── Scopes ──────────────────────────────────────────────
export const OAUTH_SCOPES = [
  // Documents
  'documents:read',
  'documents:write',
  // Knowledge base
  'knowledge:read',
  // Integrations
  'integrations:read',
  'integrations:write',
  'integrations:write:sensitive',
  // Outbound comms (single + bulk)
  'comms:send',
  'comms:send:bulk',
  // EXCLUDED (deliberate, not an oversight):
  //   platform:*     — tenant config, billing, invites; UI-only.
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
  // Documents
  'documents:read': 'View documents and their metadata',
  'documents:write': 'Upload and update documents',
  // Knowledge base
  'knowledge:read': 'Search and read the knowledge base',
  // Integrations
  'integrations:read': 'View connected integrations and sync state',
  'integrations:write': 'Trigger integration syncs',
  'integrations:write:sensitive': 'Connect or disconnect integrations (requires PIN approval)',
  // Outbound comms
  'comms:send': 'Send a message to a single recipient',
  'comms:send:bulk': 'Send bulk broadcasts to many recipients',
};
