import { type INestApplication, RequestMethod } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { ApiExcludeController, DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { zodV3ToOpenAPI } from 'nestjs-zod';
import { componentRef, responseSchemas } from '@appshore/platform/shared/openapi/api-result';
import { ApiErrorEnvelopeResponse } from '@appshore/platform/shared/openapi/common-responses';
import { IS_PUBLIC_KEY } from '@appshore/platform/auth/decorators/public.decorator';
import { ROLES_KEY } from '@appshore/platform/auth/decorators/roles.decorator';
import { idempotentCreateStatus } from '@appshore/platform/infrastructure/idempotency/idempotency.interceptor';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
} from '@appshore/platform/infrastructure/idempotency/idempotency.store';
import { OAuthErrorFilter } from '@appshore/platform/domains/oauth-provider/oauth-error.filter';
import { OAuthErrorResponse } from '@appshore/platform/domains/oauth-provider/openapi.responses';
import { UserRole } from '@appshore/db';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isProductionEnv } from '../config/production-guard';
import { documentedRoutes, sortKeys } from './openapi-routes';
import { buildPublicOpenApiDocument, vendorRoutes } from './public-openapi';

export { sortKeys } from './openapi-routes';

/** apps/backend/package.json: two levels up from both `src/bootstrap` and `dist/bootstrap`. */
const { version } = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  version: string;
};

/**
 * The published contract (ADR "API contract", section 4): ONE builder for the document the API serves at
 * `/api/openapi.json` and the two committed at `apps/backend/openapi.json` and `public-openapi.json`
 * (`pnpm --filter @app/backend openapi:generate`, held by `architecture/swagger-completeness.spec.ts`). It needs no
 * port and no connection: the generator boots the module graph in Nest's preview mode, where no provider is
 * instantiated.
 */

export const API_GLOBAL_PREFIX = 'api/v1';

/** Where the served document lives, outside the API prefix. */
export const OPENAPI_DOCUMENT_PATH = '/api/openapi.json';

/**
 * The MCP root controller answers at `/` without the prefix: Claude.ai sends POST/GET/DELETE to the domain root after
 * OAuth (the MCP spec strips the path for the auth base URL).
 */
export function applyGlobalPrefix(app: INestApplication): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: [
      { path: '/', method: RequestMethod.POST },
      { path: '/', method: RequestMethod.GET },
      { path: '/', method: RequestMethod.DELETE },
    ],
  });
}

const DESCRIPTION = [
  'The App API: one contract for the web app, the mobile app and agents (ADR "API contract").',
  '',
  '- **Auth:** a session JWT, a personal API key (`Authorization: Bearer sk_…`) or an OAuth 2.1 access token.',
  '- **Errors:** every error is the `ApiErrorEnvelope` with a machine `code` (`VALIDATION_FAILED`, `INVALID_STATE`, `DUPLICATE`, …).',
  '- **Lists:** cursor-paged (`limit`, `cursor` → `{ items, nextCursor, total }`).',
  `- **Retries:** a create accepts an optional \`${IDEMPOTENCY_KEY_HEADER}\`; a retry with the same key replays the first response for 24 hours (\`${IDEMPOTENT_REPLAYED_HEADER}: true\`).`,
  '- **Versioning:** additive changes ship in v1; a breaking change ships as v2 beside v1, which then carries `Deprecation` and `Sunset` headers for at least six months.',
].join('\n');

export interface OpenApiOptions {
  /** The API origin clients call (the served copy names the configured issuer); `/`, the same origin, when unset. */
  serverUrl?: string;
}

/** Build the full document from a created (or previewed) app. Deterministic: keys are sorted at every depth. */
export function buildOpenApiDocument(app: INestApplication, options: OpenApiOptions = {}): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('App API')
    .setDescription(DESCRIPTION)
    .setVersion(version)
    .addServer(options.serverUrl ?? '/', options.serverUrl ? 'This deployment' : 'The origin serving this document')
    .addBearerAuth()
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'A personal API key (sk_…)',
        name: 'Authorization',
        in: 'header',
      },
      'api-key',
    )
    .build();

  excludeLibraryTransports(app);
  const document = SwaggerModule.createDocument(app, config);
  addResponseSchemas(document);
  addErrorEnvelope(document, oauthProtocolOperationIds(app));
  addIdempotencyKey(document, idempotentOperationIds(app));
  return sortKeys(document);
}

/**
 * What `/api/openapi.json` serves (owner decision 6). In production, `isProductionEnv()`, the public subset: what an
 * outside developer can call. Every deployed task of the shipped image counts (it sets `NODE_ENV=production`), so
 * staging serves the subset too: a deployed staging is reachable from the internet and must not publish the admin
 * routes. Outside production, the full document. The committed `openapi.json` is always the full one.
 */
export function buildServedOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): OpenAPIObject {
  const document = buildOpenApiDocument(app, options);
  if (!isProductionEnv(env)) return document;
  // A route the classifier cannot place is never public; the generator refuses it, so the committed files say so.
  return buildPublicOpenApiDocument(document, vendorRoutes(documentedRoutes(app)).routes);
}

/**
 * `@rekog/mcp-nest` mounts its own transport controllers. They are unused (agents reach MCP at `McpServerController`,
 * `/api/v1/mcp`, and `McpRootController`, `/`) and are not part of the contract.
 */
function excludeLibraryTransports(app: INestApplication): void {
  for (const module of app.get(ModulesContainer).values()) {
    if (module.metatype?.name !== 'McpModule') continue;
    for (const wrapper of module.controllers.values()) {
      if (wrapper.metatype) ApiExcludeController()(wrapper.metatype as new (...args: unknown[]) => unknown);
    }
  }
}

/** Every `defineResponseSchema` → `components.schemas`, converted from Zod. */
function addResponseSchemas(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  for (const [name, schema] of responseSchemas()) {
    if (document.components.schemas[name])
      throw new Error(`OpenAPI: response schema "${name}" clashes with a DTO class`);
    document.components.schemas[name] = zodV3ToOpenAPI(schema as never);
  }
}

/** An operation as the builder edits it: swagger's own typing is too loose to help. */
type Operation = {
  operationId: string;
  parameters?: unknown[];
  responses?: Record<string, { content?: unknown; description?: string }>;
};

function operations(document: OpenAPIObject): Array<[string, string, Operation]> {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item as Record<string, Operation>)
      .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
      .map(([method, op]): [string, string, Operation] => [path, method, op]),
  );
}

/**
 * ADR "API contract", section 2: every error is the envelope, as a `default` response and on any 4xx/5xx a route
 * names. The OAuth protocol routes (`OAuthErrorFilter`) answer the standard's own error body instead (RFC 6749 5.2).
 */
function addErrorEnvelope(document: OpenAPIObject, oauthIds: Set<string>): void {
  const envelope = {
    description: 'An error: the API error envelope; `code` says what happened',
    content: { 'application/json': { schema: componentRef(ApiErrorEnvelopeResponse.name) } },
  };
  const oauth = {
    description: 'An OAuth error (RFC 6749 section 5.2): `error` says what happened',
    content: { 'application/json': { schema: componentRef(OAuthErrorResponse.name) } },
  };
  for (const [, , op] of operations(document)) {
    const error = oauthIds.has(op.operationId) ? oauth : envelope;
    op.responses ??= {};
    for (const [status, response] of Object.entries(op.responses)) {
      if (/^[45]\d\d$/.test(status) && !response.content) response.content = error.content;
    }
    op.responses.default = error;
  }
}

/** The routes whose errors leave through `OAuthErrorFilter` (class- or handler-level). */
function oauthProtocolOperationIds(app: INestApplication): Set<string> {
  const filtersOf = (target: object) => (Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, target) as unknown[]) ?? [];
  return new Set(
    documentedRoutes(app)
      .filter(({ controller, handler }) => [...filtersOf(controller), ...filtersOf(handler)].includes(OAuthErrorFilter))
      .map(({ operationId }) => operationId),
  );
}

/**
 * The operation ids of every create the idempotency interceptor honours (`idempotentCreateStatus`): a POST answering
 * 201 or 202 that is not `@Public()`, not `@SkipIdempotency()`, does not write its own response, and is not for super
 * admins alone (they act outside any tenant, and the key is scoped per tenant).
 */
function idempotentOperationIds(app: INestApplication): Set<string> {
  const ids = new Set<string>();
  for (const { controller, handler, operationId } of documentedRoutes(app)) {
    if (Reflect.getMetadata(IS_PUBLIC_KEY, handler) || Reflect.getMetadata(IS_PUBLIC_KEY, controller)) continue;
    const roles: string[] | undefined =
      Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, controller);
    if (roles?.length && roles.every((role) => role === UserRole.SUPER_ADMIN)) continue;
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
    if (method && idempotentCreateStatus(method, controller, handler) !== null) ids.add(operationId);
  }
  return ids;
}

/** Document the optional header on exactly the operations that honour it (ADR "API contract", section 5). */
function addIdempotencyKey(document: OpenAPIObject, ids: Set<string>): void {
  for (const [, method, op] of operations(document)) {
    if (method !== 'post' || !ids.has(op.operationId)) continue;
    op.parameters = [
      ...(op.parameters ?? []),
      {
        name: IDEMPOTENCY_KEY_HEADER,
        in: 'header',
        required: false,
        description:
          'Optional, 1–255 visible ASCII characters (a UUID). A retry with the same key and request replays the first response for 24 hours, marked `Idempotent-Replayed: true`; the same key with a different request is 409 IDEMPOTENCY_KEY_REUSED, and a retry while the first is still running is 409 IDEMPOTENCY_KEY_IN_USE.',
        schema: { type: 'string', maxLength: 255 },
      },
    ];
  }
}
