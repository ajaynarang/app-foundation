import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Controller, Get, HttpCode, HttpStatus, Module, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { ApiKeyAuthGuard } from '@appshore/platform/domains/api-keys/guards/api-key-auth.guard';
import { ApiKeysService } from '@appshore/platform/domains/api-keys/api-keys.service';
import { BearerChallengeFilter } from '@appshore/platform/domains/oauth-provider/bearer-challenge.filter';
import { AgentRateLimitGuard } from '../domains/ai/mcp-server/guards/agent-rate-limit.guard';
import { RateLimitService } from '../domains/ai/agent-contract/rate-limit.service';
import { applyGlobalPrefix, buildServedOpenApiDocument } from '../bootstrap/openapi';

/**
 * The published contract (ADR "API contract", section 4).
 *
 * Runs the real generator (`scripts/generate-openapi.ts`: the module graph in Nest's preview mode, no port, no
 * connections) once, then holds these lines:
 *
 * 1. **Completeness.** The generator audits the document against the routes' own metadata (summary, tag, described
 *    path params, one success response at the route's real status with a schema) and refuses to write an incomplete
 *    one (`bootstrap/openapi-audit.ts`). It also refuses a route the public classifier cannot place
 *    (`bootstrap/public-openapi.ts`).
 * 2. **No drift.** What the code generates is byte for byte the committed `apps/backend/openapi.json` and
 *    `public-openapi.json`. A contract change is therefore always a reviewed diff of those files.
 * 3. **What is served.** `/api/openapi.json` serves the public subset when `isProductionEnv()` holds, so every
 *    deployed task of the shipped image (it sets `NODE_ENV=production`, staging included); a local run serves the full
 *    document.
 */

const BACKEND = join(__dirname, '..', '..');
const COMMITTED = join(BACKEND, 'openapi.json');
const COMMITTED_PUBLIC = join(BACKEND, 'public-openapi.json');
const REGENERATE = 'pnpm --filter @app/backend openapi:generate';

function firstDifference(generated: string, committed: string): string {
  const a = generated.split('\n');
  const b = committed.split('\n');
  const line = a.findIndex((l, i) => l !== b[i]);
  return `First difference at line ${line + 1}:\n  generated: ${a[line]}\n  committed: ${b[line]}`;
}

describe('Published OpenAPI contract', () => {
  const dir = mkdtempSync(join(tmpdir(), 'openapi-'));
  const out = join(dir, 'openapi.json');
  const publicOut = join(dir, 'public-openapi.json');
  let run: ReturnType<typeof spawnSync>;

  beforeAll(() => {
    // A pinned, minimal environment: the document never depends on the machine that generated it.
    run = spawnSync('npx', ['ts-node', 'scripts/generate-openapi.ts', out], {
      cwd: BACKEND,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      timeout: 170_000,
    });
  }, 180_000);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('every route is documented (swagger completeness), and every public-looking route is classified', () => {
    if (run.status !== 0) {
      throw new Error(`The generator refused the document (exit ${run.status}):\n${String(run.stderr).slice(-6000)}`);
    }
  });

  it(`the committed apps/backend/openapi.json is what the code generates: regenerate with \`${REGENERATE}\``, () => {
    expect(run.status).toBe(0);
    const generated = readFileSync(out, 'utf8');
    const committed = readFileSync(COMMITTED, 'utf8');
    if (generated !== committed) {
      throw new Error(
        `apps/backend/openapi.json is stale: run \`${REGENERATE}\` and commit the diff.\n` +
          firstDifference(generated, committed),
      );
    }
  });

  it(`the committed apps/backend/public-openapi.json is what the code generates: regenerate with \`${REGENERATE}\``, () => {
    expect(run.status).toBe(0);
    const generated = readFileSync(publicOut, 'utf8');
    const committed = readFileSync(COMMITTED_PUBLIC, 'utf8');
    if (generated !== committed) {
      throw new Error(
        `apps/backend/public-openapi.json is stale: run \`${REGENERATE}\` and commit the diff.\n` +
          firstDifference(generated, committed),
      );
    }
  });

  it('the public contract only takes outside credentials, and each operation is the full contract’s own', () => {
    type Op = { operationId: string; security?: Array<Record<string, unknown>> };
    const pub: { paths: Record<string, Record<string, Op>>; components: { securitySchemes: object } } = JSON.parse(
      readFileSync(COMMITTED_PUBLIC, 'utf8'),
    );
    const full: { paths: Record<string, Record<string, Op>> } = JSON.parse(readFileSync(COMMITTED, 'utf8'));
    expect(Object.keys(pub.components.securitySchemes).sort()).toEqual(['api-key', 'oauth']);
    for (const [path, item] of Object.entries(pub.paths)) {
      for (const [method, op] of Object.entries(item)) {
        for (const requirement of op.security ?? []) {
          expect(Object.keys(requirement).every((s) => s === 'api-key' || s === 'oauth')).toBe(true);
        }
        // The OAuth discovery documents are Express middleware, declared by the public builder alone.
        if (op.operationId.startsWith('OAuthMetadata_')) continue;
        const fullOp = full.paths[path]?.[method];
        expect(fullOp).toBeDefined();
        const { security: _p, ...published } = op;
        const { security: _f, ...original } = fullOp;
        expect(published).toEqual(original);
      }
    }
  });

  it('the public contract publishes no admin, session or tenant route: in the template, MCP and OAuth only', () => {
    const pub: { paths: Record<string, unknown> } = JSON.parse(readFileSync(COMMITTED_PUBLIC, 'utf8'));
    expect(Object.keys(pub.paths).sort()).toEqual([
      '/',
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource',
      '/api/v1/mcp',
      '/api/v1/mcp/apikey',
      '/api/v1/oauth/authorize',
      '/api/v1/oauth/register',
      '/api/v1/oauth/revoke',
      '/api/v1/oauth/token',
    ]);
  });

  it('is the App API: same-origin server, no dev-only routes, the envelope on every operation', () => {
    const doc: {
      info: { title: string };
      servers: unknown;
      paths: Record<string, Record<string, { operationId: string; responses: Record<string, any> }>>;
    } = JSON.parse(readFileSync(COMMITTED, 'utf8'));
    // The OAuth protocol routes (OAuthErrorFilter) answer the RFC 6749 error body instead.
    const OAUTH_PROTOCOL = ['authorize', 'token', 'revoke', 'register'].map((m) => `OAuthProviderController_${m}`);
    expect(doc.info.title).toBe('App API');
    expect(doc.servers).toEqual([{ description: expect.any(String), url: '/' }]);
    const paths = Object.keys(doc.paths);
    expect(paths.some((p) => p.startsWith('/api/v1/dev/'))).toBe(false);
    for (const item of Object.values(doc.paths)) {
      for (const op of Object.values(item)) {
        const error = OAUTH_PROTOCOL.includes(op.operationId) ? 'OAuthError' : 'ApiErrorEnvelope';
        expect(op.responses.default.content['application/json'].schema).toEqual({
          $ref: `#/components/schemas/${error}`,
        });
      }
    }
  });

  it('a response that shows a secret once is never stored for Idempotency-Key replay', () => {
    type Schema = { properties?: Record<string, unknown> };
    const doc: {
      paths: Record<string, Record<string, { parameters?: Array<{ name: string }>; responses: object }>>;
      components: { schemas: Record<string, Schema> };
    } = JSON.parse(readFileSync(COMMITTED, 'utf8'));
    const secretBearing = Object.entries(doc.components.schemas)
      .filter(([, schema]) => Object.keys(schema.properties ?? {}).some((field) => SECRET_FIELDS.includes(field)))
      .map(([name]) => name);
    // The detector still sees the starter's own secret-bearing bodies: a renamed field would otherwise blind it.
    expect(secretBearing).toEqual(expect.arrayContaining(KNOWN_SECRET_BEARING_SCHEMAS));
    const replayable = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, op]) => op.parameters?.some((p) => p.name === 'Idempotency-Key'))
        .filter(([, op]) => secretBearing.some((name) => JSON.stringify(op.responses).includes(`/${name}"`)))
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );
    expect(replayable).toEqual([]); // mark each route @SkipIdempotency()
  });
});

/** A response property that carries a secret shown once: a key, a client or signing secret, a token, a token link. */
const SECRET_FIELDS = [
  'key',
  'apiKey',
  'secret',
  'clientSecret',
  'signingSecret',
  'token',
  'accessToken',
  'inviteLink',
];

/** The starter's bodies that show a secret once; each must still be found through {@link SECRET_FIELDS}. */
const KNOWN_SECRET_BEARING_SCHEMAS = [
  'ApiKeyDto',
  'OAuthClientCreated',
  'OAuthClientSecretRotated',
  'WebhookSubscriptionCreated',
  'WebhookSubscriptionWithSecret',
  'InvitationIssued',
  'VoiceToken',
];

/**
 * What `/api/openapi.json` serves, by environment (owner decision 6). The builder decides through
 * `isProductionEnv()` and nothing else, so it is exercised here with the environment as the only input.
 */
describe('buildServedOpenApiDocument', () => {
  @ApiTags('Admin')
  @Controller('admin/things')
  class InternalController {
    @Get()
    @ApiOperation({ summary: 'An admin read: never in the public document' })
    list() {}
  }

  @ApiTags('Reports')
  @Controller('reports')
  @Public()
  @UseGuards(ApiKeyAuthGuard, AgentRateLimitGuard)
  @UseFilters(BearerChallengeFilter)
  class VendorController {
    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'A route a product opens to API keys' })
    report(@Res() _res: unknown) {}
  }

  /** The guards' and filter's own dependencies: never called, since preview mode instantiates nothing. */
  const dependencies = [ConfigService, ApiKeysService, RateLimitService].map((provide) => ({ provide, useValue: {} }));

  async function served(env: NodeJS.ProcessEnv): Promise<OpenAPIObject> {
    @Module({ controllers: [InternalController, VendorController], providers: dependencies })
    class SpecModule {}
    const app = await NestFactory.create(SpecModule, { preview: true, logger: false });
    applyGlobalPrefix(app);
    const document = buildServedOpenApiDocument(app, {}, env);
    await app.close();
    return document;
  }

  const pathsOf = (doc: OpenAPIObject) => Object.keys(doc.paths).sort();

  it('serves the public subset for ENV_TYPE=production', async () => {
    const doc = await served({ ENV_TYPE: 'production' });
    expect(doc.info.title).toBe('App public API');
    expect(pathsOf(doc)).toContain('/api/v1/reports');
    expect(pathsOf(doc)).not.toContain('/api/v1/admin/things');
  });

  it('serves the public subset for NODE_ENV=production with ENV_TYPE=sandbox (every deployed task, staging too)', async () => {
    const doc = await served({ NODE_ENV: 'production', ENV_TYPE: 'sandbox' });
    expect(doc.info.title).toBe('App public API');
    expect(pathsOf(doc)).not.toContain('/api/v1/admin/things');
  });

  it('serves the full document to a local run', async () => {
    const doc = await served({ NODE_ENV: 'development', ENV_TYPE: 'development' });
    expect(doc.info.title).toBe('App API');
    expect(pathsOf(doc)).toEqual(expect.arrayContaining(['/api/v1/admin/things', '/api/v1/reports']));
  });
});
