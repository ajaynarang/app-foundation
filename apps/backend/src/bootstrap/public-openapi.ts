import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import type { OpenAPIObject } from '@nestjs/swagger';
import { OAUTH_SCOPES, OAUTH_SCOPE_DESCRIPTIONS } from '@app/shared-types';
import { IS_PUBLIC_KEY } from '@appshore/platform/auth/decorators/public.decorator';
import { RefreshJwtAuthGuard } from '@appshore/platform/auth/guards/refresh-jwt-auth.guard';
import { ApiKeyAuthGuard } from '@appshore/platform/domains/api-keys/guards/api-key-auth.guard';
import { BearerChallengeFilter } from '@appshore/platform/domains/oauth-provider/bearer-challenge.filter';
import { OAuthErrorFilter } from '@appshore/platform/domains/oauth-provider/oauth-error.filter';
import { OAuthTokenGuard } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import { AgentRateLimitGuard } from '../domains/ai/mcp-server/guards/agent-rate-limit.guard';
import { AUTHORIZATION_SERVER_METADATA_PATH, PROTECTED_RESOURCE_METADATA_PATH } from './oauth-metadata';
import { type DocumentedRoute, sortKeys } from './openapi-routes';

/**
 * The public contract (owner decision 6): the slice of the published document an outside developer can call, decided from each
 * route's own metadata, never from a hand list. A route is a vendor route when the global session chain stands aside
 * (`@Public()`) and the route takes an outside credential (a guard below), is metered as an agent
 * (`AgentRateLimitGuard`), or speaks an agent protocol (`BearerChallengeFilter`, `OAuthErrorFilter`).
 */

export type VendorScheme = 'api-key' | 'oauth';

/** Each guard that authenticates an outside credential, and the security scheme it stands for. */
export const AGENT_AUTH_GUARDS: ReadonlyMap<unknown, VendorScheme> = new Map<unknown, VendorScheme>([
  [ApiKeyAuthGuard, 'api-key'],
  [OAuthTokenGuard, 'oauth'],
]);

const PROTOCOL_FILTERS: readonly unknown[] = [BearerChallengeFilter, OAuthErrorFilter];

/**
 * Guards a `@Public()` route may carry that are not an outside credential with the reason for each. A guard on a public
 * route that is in neither this map nor `AGENT_AUTH_GUARDS` stops the generator: a new credential type must never
 * slip out of (or into) the public contract unclassified.
 */
export const NON_CREDENTIAL_GUARDS: ReadonlyMap<unknown, string> = new Map<unknown, string>([
  [RefreshJwtAuthGuard, "the web app's session refresh token: a signed-in person, not an integration"],
]);

/**
 * Agent-protocol routes that take no credential on purpose: the MCP stream probes answer 405 to anyone (the MCP spec
 * asks a stateless server to). Any other `BearerChallengeFilter` route without a credential guard stops the generator.
 */
export const PROTOCOL_PROBES: ReadonlySet<string> = new Set([
  'McpRootController_handleSseStream',
  'McpServerController_handleSseStream',
]);

export interface VendorRoute {
  operationId: string;
  /** The schemes the operation accepts; empty for protocol routes that take no bearer credential. */
  security: VendorScheme[];
}

/** Class- and handler-level metadata, as Nest applies them (class first); guard and filter instances → their class. */
function metadataList(key: string, route: DocumentedRoute): unknown[] {
  const own = (target: object) => (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];
  return [...own(route.controller), ...own(route.handler)].map((entry) =>
    typeof entry === 'function' ? entry : (entry as object).constructor,
  );
}

const nameOf = (value: unknown) => (value as { name: string }).name;

function classify(
  route: DocumentedRoute,
  probes: ReadonlySet<string>,
): { vendor: VendorRoute | null; problems: string[] } {
  const guards = metadataList(GUARDS_METADATA, route);
  const filters = metadataList(EXCEPTION_FILTERS_METADATA, route);
  const isPublic = !!(
    Reflect.getMetadata(IS_PUBLIC_KEY, route.handler) || Reflect.getMetadata(IS_PUBLIC_KEY, route.controller)
  );
  const authGuards = guards.filter((g) => AGENT_AUTH_GUARDS.has(g));
  const meteredAsAgent = guards.includes(AgentRateLimitGuard);
  const speaksProtocol = filters.some((f) => PROTOCOL_FILTERS.includes(f));
  const id = route.operationId;
  const problems: string[] = [];

  const unclassified = guards.filter(
    (g) => !AGENT_AUTH_GUARDS.has(g) && g !== AgentRateLimitGuard && !NON_CREDENTIAL_GUARDS.has(g),
  );
  if (isPublic && unclassified.length > 0) {
    problems.push(
      `${id}: @Public() with an unclassified guard (${unclassified.map(nameOf).join(', ')}): add it to ` +
        'AGENT_AUTH_GUARDS (an outside credential, with its scheme) or NON_CREDENTIAL_GUARDS (with the reason it is ' +
        'not one) in bootstrap/public-openapi.ts',
    );
  }
  if ((authGuards.length > 0 || speaksProtocol) && !isPublic) {
    problems.push(`${id}: takes an outside credential but is not @Public(): the session guard runs first`);
  }
  if (authGuards.length > 0 && !filters.includes(BearerChallengeFilter)) {
    problems.push(`${id}: takes an outside credential without @UseFilters(BearerChallengeFilter)`);
  }
  if (filters.includes(BearerChallengeFilter) && authGuards.length === 0 && !probes.has(id)) {
    problems.push(
      `${id}: speaks the bearer challenge but takes no credential: add a credential guard, or declare it in ` +
        'PROTOCOL_PROBES if it is meant to answer anyone',
    );
  }
  if (problems.length > 0 || !isPublic || !(authGuards.length > 0 || meteredAsAgent || speaksProtocol)) {
    return { vendor: null, problems };
  }
  const security = [...new Set(authGuards.map((g) => AGENT_AUTH_GUARDS.get(g)))];
  return { vendor: { operationId: id, security }, problems };
}

/** The vendor routes among `routes` (sorted by operationId), and every route that could not be classified safely. */
export function vendorRoutes(
  routes: DocumentedRoute[],
  probes: ReadonlySet<string> = PROTOCOL_PROBES,
): { routes: VendorRoute[]; problems: string[] } {
  const results = routes.map((route) => classify(route, probes));
  const ids = new Set(routes.map((r) => r.operationId));
  const staleProbes = [...probes]
    .filter((id) => !ids.has(id))
    .map((id) => `${id}: declared in PROTOCOL_PROBES but no such route`);
  return {
    routes: results
      .flatMap((r) => (r.vendor ? [r.vendor] : []))
      .sort((a, b) => a.operationId.localeCompare(b.operationId)),
    problems: [...results.flatMap((r) => r.problems), ...staleProbes].sort(),
  };
}

type Json = Record<string, unknown>;
type Operation = Json & { operationId?: string; security?: unknown; tags?: string[] };

const SCHEMA_REF = /^#\/components\/schemas\/(.+)$/;

function collectRefs(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) value.forEach((v) => collectRefs(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      const name = key === '$ref' && typeof v === 'string' ? SCHEMA_REF.exec(v)?.[1] : undefined;
      if (name) out.add(name);
      else collectRefs(v, out);
    }
  }
}

/** The component schemas `paths` reach, transitively, in name order. */
function reachableSchemas(paths: unknown, schemas: Record<string, unknown>): Record<string, unknown> {
  const keep = new Set<string>();
  const queue = new Set<string>();
  collectRefs(paths, queue);
  while (queue.size > 0) {
    const [name] = queue;
    queue.delete(name);
    if (keep.has(name) || !(name in schemas)) continue;
    keep.add(name);
    collectRefs(schemas[name], queue);
  }
  return Object.fromEntries([...keep].sort().map((name) => [name, schemas[name]]));
}

const stringList = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

/**
 * The OAuth discovery documents (`bootstrap/oauth-metadata.ts`). They are Express middleware, not Nest routes, so the
 * document builder never sees them; they are declared here, and `public-openapi.spec.ts` holds the paths and fields
 * to what `mountOAuthMetadata` serves.
 */
export const OAUTH_DISCOVERY_SCHEMAS = {
  OAuthAuthorizationServerMetadata: {
    type: 'object',
    description: 'RFC 8414 authorization server metadata',
    required: ['issuer', 'authorization_endpoint', 'token_endpoint'],
    properties: {
      issuer: { type: 'string', description: 'The issuer of every access token' },
      authorization_endpoint: { type: 'string' },
      token_endpoint: { type: 'string' },
      registration_endpoint: { type: 'string', description: 'Dynamic client registration (RFC 7591)' },
      revocation_endpoint: { type: 'string' },
      response_types_supported: stringList('Always `code`'),
      grant_types_supported: stringList('`authorization_code`, `refresh_token`'),
      code_challenge_methods_supported: stringList('Always `S256`'),
      scopes_supported: stringList('The scopes a client may ask for'),
      token_endpoint_auth_methods_supported: stringList('`client_secret_post`, `none`'),
    },
  },
  OAuthProtectedResourceMetadata: {
    type: 'object',
    description: 'RFC 9728 protected resource metadata',
    required: ['resource', 'authorization_servers'],
    properties: {
      resource: { type: 'string', description: 'The protected resource: this API' },
      authorization_servers: stringList('The issuer that grants tokens for it'),
      scopes_supported: stringList('The scopes a client may ask for'),
    },
  },
} as const;

function discoveryOperation(operationId: string, summary: string, schema: keyof typeof OAUTH_DISCOVERY_SCHEMAS) {
  return {
    get: {
      operationId,
      summary,
      tags: ['OAuth'],
      responses: {
        '200': {
          description: 'The discovery document',
          content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
        },
      },
    },
  };
}

/** The discovery paths, as `mountOAuthMetadata` serves them. */
export const OAUTH_DISCOVERY_PATHS: Record<string, ReturnType<typeof discoveryOperation>> = {
  [AUTHORIZATION_SERVER_METADATA_PATH]: discoveryOperation(
    'OAuthMetadata_authorizationServer',
    'OAuth 2.1 authorization server metadata (RFC 8414)',
    'OAuthAuthorizationServerMetadata',
  ),
  [PROTECTED_RESOURCE_METADATA_PATH]: discoveryOperation(
    'OAuthMetadata_protectedResource',
    'Protected resource metadata for the MCP endpoints (RFC 9728)',
    'OAuthProtectedResourceMetadata',
  ),
};

const PUBLIC_DESCRIPTION = [
  'What an outside developer can call: the MCP server, the OAuth 2.1 endpoints, and any route a product opens to API keys.',
  '',
  '- **Auth:** a personal API key (`Authorization: Bearer sk_…`) or an OAuth 2.1 access token, as each operation says.',
  '- **Errors:** REST errors are the `ApiErrorEnvelope` with a machine `code`; OAuth endpoints answer RFC 6749 errors.',
  '- **Versioning:** additive changes ship in v1; a breaking change ships as v2 beside v1, which then carries ' +
    '`Deprecation` and `Sunset` headers for at least six months.',
].join('\n');

/**
 * The full published document cut down to `routes`: their operations, credentials, tags and the schemas they reach.
 * Keys sorted at every depth, like the full document, so the file changes only when the public contract does.
 */
export function buildPublicOpenApiDocument(document: OpenAPIObject, routes: VendorRoute[]): OpenAPIObject {
  const security = new Map(routes.map((r) => [r.operationId, r.security]));
  const paths: Record<string, Record<string, Operation>> = {};
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, op] of Object.entries(item as Record<string, Operation>)) {
      const schemes = op?.operationId ? security.get(op.operationId) : undefined;
      if (!schemes) continue;
      const { security: _session, ...rest } = op;
      paths[path] = {
        ...paths[path],
        [method]: schemes.length > 0 ? { ...rest, security: schemes.map((s) => ({ [s]: [] })) } : rest,
      };
    }
  }

  Object.assign(paths, OAUTH_DISCOVERY_PATHS);
  const tags = [...new Set(Object.values(paths).flatMap((item) => Object.values(item).flatMap((op) => op.tags ?? [])))];
  const components = document.components ?? {};
  return sortKeys({
    ...document,
    info: { ...document.info, title: 'App public API', description: PUBLIC_DESCRIPTION },
    tags: tags.sort().map((name) => ({ name })),
    paths,
    components: {
      ...components,
      schemas: {
        ...reachableSchemas(paths, (components.schemas ?? {}) as Record<string, unknown>),
        ...OAUTH_DISCOVERY_SCHEMAS,
      } as never,
      securitySchemes: {
        'api-key': components.securitySchemes?.['api-key'] as never,
        oauth: {
          type: 'oauth2',
          description: 'OAuth 2.1: authorization code with PKCE (S256); dynamic client registration.',
          flows: {
            authorizationCode: {
              authorizationUrl: '/api/v1/oauth/authorize',
              tokenUrl: '/api/v1/oauth/token',
              scopes: Object.fromEntries(
                OAUTH_SCOPES.map((scope) => [scope, OAUTH_SCOPE_DESCRIPTIONS[scope] ?? scope]),
              ),
            },
          },
        },
      },
    },
  });
}
