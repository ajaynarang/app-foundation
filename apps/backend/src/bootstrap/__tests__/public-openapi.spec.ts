import {
  Body,
  CanActivate,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { OAUTH_SCOPES } from '@app/shared-types';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { ApiKeyAuthGuard } from '@appshore/platform/domains/api-keys/guards/api-key-auth.guard';
import { BearerChallengeFilter } from '@appshore/platform/domains/oauth-provider/bearer-challenge.filter';
import { OAuthErrorFilter } from '@appshore/platform/domains/oauth-provider/oauth-error.filter';
import { OAuthTokenGuard } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import { ApiResult, defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { AgentRateLimitGuard } from '../../domains/ai/mcp-server/guards/agent-rate-limit.guard';
import { RateLimitService } from '../../domains/ai/agent-contract/rate-limit.service';
import { ApiKeysService } from '@appshore/platform/domains/api-keys/api-keys.service';
import { OAuthProviderService } from '@appshore/platform/domains/oauth-provider/oauth-provider.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { applyGlobalPrefix, buildOpenApiDocument } from '../openapi';
import { documentedRoutes } from '../openapi-routes';
import { mountOAuthMetadata } from '../oauth-metadata';
import {
  buildPublicOpenApiDocument,
  OAUTH_DISCOVERY_PATHS,
  OAUTH_DISCOVERY_SCHEMAS,
  PROTOCOL_PROBES,
  vendorRoutes,
} from '../public-openapi';

const Widget = defineResponseSchema('PublicSpecWidget', z.object({ id: z.string() }));
class RunPartDto {
  @ApiProperty()
  name!: string;
}
/** A body that reaches a second schema: the trim must follow the reference. */
class RunDto {
  @ApiProperty({ type: () => RunPartDto })
  part!: RunPartDto;
}

const Secret = defineResponseSchema('PublicSpecSecret', z.object({ hash: z.string() }));

/** A route a product opens to API keys: what makes it public is its guard, not a list. */
@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@Public()
@UseGuards(ApiKeyAuthGuard, AgentRateLimitGuard)
@UseFilters(BearerChallengeFilter)
class ReportsController {
  @Post('runs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a run' })
  @ApiResult(Widget)
  report(@Body() _dto: RunDto) {}
}

@ApiTags('MCP')
@Controller('mcp')
@UseFilters(BearerChallengeFilter)
class McpController {
  @Post()
  @Public()
  @UseGuards(OAuthTokenGuard, AgentRateLimitGuard)
  @ApiOperation({ summary: 'MCP over OAuth' })
  oauth(@Res() _res: unknown) {}

  @Post('apikey')
  @Public()
  @UseGuards(ApiKeyAuthGuard, AgentRateLimitGuard)
  @ApiOperation({ summary: 'MCP over an API key' })
  apiKey(@Res() _res: unknown) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'No stream (405)' })
  stream(@Res() _res: unknown) {}
}

@ApiTags('OAuth')
@Controller('oauth')
class OAuthController {
  @Post('token')
  @Public()
  @UseFilters(OAuthErrorFilter)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token' })
  token() {}

  @Post('consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'A person approves a client (session)' })
  @ApiResult(Secret)
  consent() {}
}

@ApiTags('Auth')
@Controller('auth')
class SessionController {
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Password login (public, not a vendor route)' })
  login() {}

  @Get('me')
  @ApiOperation({ summary: 'The signed-in person' })
  @ApiResult(Secret)
  me() {}
}

class SomeNewCredentialGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

@ApiTags('Broken')
@Controller('broken')
class BrokenController {
  @Post('unmapped')
  @Public()
  @UseGuards(SomeNewCredentialGuard, AgentRateLimitGuard)
  @UseFilters(BearerChallengeFilter)
  @ApiOperation({ summary: 'A credential nobody classified' })
  unmapped() {}

  @Delete('behind-session')
  @UseGuards(OAuthTokenGuard)
  @UseFilters(BearerChallengeFilter)
  @ApiOperation({ summary: 'Agent guard behind the session chain' })
  behindSession() {}

  @Post('no-challenge')
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent guard without the bearer challenge' })
  noChallenge() {}

  @Get('challenge-only')
  @Public()
  @UseFilters(BearerChallengeFilter)
  @ApiOperation({ summary: 'Bearer challenge but no credential, and not a declared probe' })
  challengeOnly() {}

  @Post('plain-public')
  @Public()
  @UseGuards(new SomeNewCredentialGuard())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'A public route with an unclassified guard instance' })
  plainPublic() {}
}

/** The guards' and filters' own dependencies: never called: preview mode instantiates nothing, but still resolves the graph. */
const GUARD_DEPENDENCIES = [ConfigService, ApiKeysService, OAuthProviderService, PrismaService, RateLimitService].map(
  (provide) => ({
    provide,
    useValue: {},
  }),
);

async function bootDocument(...controllers: Array<new (...args: never[]) => unknown>) {
  @Module({ controllers, providers: GUARD_DEPENDENCIES })
  class SpecModule {}
  const app = await NestFactory.create(SpecModule, { preview: true, logger: false });
  applyGlobalPrefix(app);
  const document = buildOpenApiDocument(app);
  const routes = documentedRoutes(app);
  await app.close();
  return { document, routes };
}

/** The fake MCP controller's stream probe, declared the way the real ones are in PROTOCOL_PROBES. */
const PROBES = new Set(['McpController_stream']);

describe('public OpenAPI contract', () => {
  describe('vendorRoutes: which routes an outside developer can call, from their metadata', () => {
    it('keeps API-key, OAuth and protocol routes, with the credential each takes', async () => {
      const { routes } = await bootDocument(ReportsController, McpController, OAuthController, SessionController);
      const { routes: vendor, problems } = vendorRoutes(routes, PROBES);
      expect(problems).toEqual([]);
      expect(vendor).toEqual([
        { operationId: 'McpController_apiKey', security: ['api-key'] },
        { operationId: 'McpController_oauth', security: ['oauth'] },
        { operationId: 'McpController_stream', security: [] },
        { operationId: 'OAuthController_token', security: [] },
        { operationId: 'ReportsController_report', security: ['api-key'] },
      ]);
    });

    it('refuses a route it cannot classify safely, naming the fix', async () => {
      const { routes } = await bootDocument(BrokenController);
      const { routes: vendor, problems } = vendorRoutes(routes, new Set(['GoneController_probe']));
      expect(problems).toEqual([
        expect.stringMatching(/BrokenController_behindSession: .*not @Public\(\)/),
        expect.stringMatching(/BrokenController_challengeOnly: .*takes no credential.*PROTOCOL_PROBES/),
        expect.stringMatching(/BrokenController_noChallenge: .*BearerChallengeFilter/),
        expect.stringMatching(
          /BrokenController_plainPublic: .*unclassified guard \(SomeNewCredentialGuard\).*NON_CREDENTIAL_GUARDS/,
        ),
        expect.stringMatching(
          /BrokenController_unmapped: .*unclassified guard \(SomeNewCredentialGuard\).*AGENT_AUTH_GUARDS/,
        ),
        expect.stringMatching(/BrokenController_unmapped: speaks the bearer challenge but takes no credential/),
        expect.stringMatching(/GoneController_probe: declared in PROTOCOL_PROBES but no such route/),
      ]);
      expect(vendor).toEqual([]);
    });

    it('the real probes are the two MCP stream endpoints', () => {
      expect([...PROTOCOL_PROBES].sort()).toEqual([
        'McpRootController_handleSseStream',
        'McpServerController_handleSseStream',
      ]);
    });
  });

  describe('buildPublicOpenApiDocument', () => {
    async function build() {
      const { document, routes } = await bootDocument(
        ReportsController,
        McpController,
        OAuthController,
        SessionController,
      );
      return { document, pub: buildPublicOpenApiDocument(document, vendorRoutes(routes, PROBES).routes) };
    }

    it('lists only vendor operations, each with the credential it takes', async () => {
      const { pub } = await build();
      expect(Object.keys(pub.paths).sort()).toEqual([
        '/.well-known/oauth-authorization-server',
        '/.well-known/oauth-protected-resource',
        '/api/v1/mcp',
        '/api/v1/mcp/apikey',
        '/api/v1/oauth/token',
        '/api/v1/reports/runs',
      ]);
      expect(Object.keys(pub.paths['/api/v1/mcp']).sort()).toEqual(['get', 'post']);
      expect(pub.paths['/api/v1/reports/runs'].post?.security).toEqual([{ 'api-key': [] }]);
      expect(pub.paths['/api/v1/mcp'].post?.security).toEqual([{ oauth: [] }]);
      expect(pub.paths['/api/v1/mcp'].get?.security).toBeUndefined();
      expect(pub.paths['/api/v1/oauth/token'].post?.security).toBeUndefined();
    });

    it('carries no session-only schema or scheme, and keeps what the kept operations reach', async () => {
      const { document, pub } = await build();
      const schemas = Object.keys(pub.components?.schemas ?? {});
      expect(schemas).toEqual(expect.arrayContaining(['ApiErrorEnvelope', 'PublicSpecWidget', 'RunDto', 'RunPartDto']));
      expect(schemas).not.toContain('PublicSpecSecret');
      expect(Object.keys(document.components?.schemas ?? {})).toContain('PublicSpecSecret');
      expect(Object.keys(pub.components?.securitySchemes ?? {}).sort()).toEqual(['api-key', 'oauth']);
    });

    it('describes OAuth as authorization code with PKCE over every advertised scope', async () => {
      const { pub } = await build();
      const oauth = pub.components?.securitySchemes?.oauth as {
        type: string;
        flows: { authorizationCode: { authorizationUrl: string; tokenUrl: string; scopes: Record<string, string> } };
      };
      expect(oauth.type).toBe('oauth2');
      expect(oauth.flows.authorizationCode.authorizationUrl).toBe('/api/v1/oauth/authorize');
      expect(oauth.flows.authorizationCode.tokenUrl).toBe('/api/v1/oauth/token');
      expect(Object.keys(oauth.flows.authorizationCode.scopes)).toEqual([...OAUTH_SCOPES].sort());
      expect(Object.values(oauth.flows.authorizationCode.scopes).every((s) => s.length > 0)).toBe(true);
    });

    it('names itself the public API and lists its tags', async () => {
      const { pub } = await build();
      expect(pub.info.title).toBe('App public API');
      expect(pub.tags?.map((t) => t.name)).toEqual(['MCP', 'OAuth', 'Reports']);
    });

    it('leaves each kept operation as the full contract has it, apart from security', async () => {
      const { document, pub } = await build();
      const { security: _a, ...full } = document.paths['/api/v1/reports/runs'].post;
      const { security: _b, ...published } = pub.paths['/api/v1/reports/runs'].post;
      expect(published).toEqual(full);
    });
  });

  describe('OAuth discovery documents', () => {
    /** Every path mountOAuthMetadata answers, with the body it sends. */
    function served(): Map<string, Record<string, unknown>> {
      const mounted: Array<[string, (req: object, res: object, next: () => void) => void]> = [];
      mountOAuthMetadata({ use: (path, handler) => mounted.push([path, handler as never]) }, 'https://api.example.com');
      const bodies = new Map<string, Record<string, unknown>>();
      for (const [path, handler] of mounted) {
        const res = { setHeader: () => res, json: (body: Record<string, unknown>) => bodies.set(path, body) };
        handler({ path: '/' }, res, () => undefined);
      }
      return bodies;
    }

    it('declares exactly the paths the backend serves', () => {
      expect(Object.keys(OAUTH_DISCOVERY_PATHS).sort()).toEqual([...served().keys()].sort());
    });

    it('describes every field each document sends', () => {
      for (const [path, body] of served()) {
        const ref = OAUTH_DISCOVERY_PATHS[path].get.responses['200'].content['application/json'].schema.$ref;
        const schema = OAUTH_DISCOVERY_SCHEMAS[ref.split('/').pop() as keyof typeof OAUTH_DISCOVERY_SCHEMAS];
        expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(body).sort());
      }
    });

    it('are in the public document, without a credential', async () => {
      const { document, routes } = await bootDocument(OAuthController);
      const pub = buildPublicOpenApiDocument(document, vendorRoutes(routes, new Set()).routes);
      for (const path of Object.keys(OAUTH_DISCOVERY_PATHS)) {
        expect(pub.paths[path]?.get?.security).toBeUndefined();
        expect(pub.paths[path]?.get?.tags).toEqual(['OAuth']);
      }
      expect(Object.keys(pub.components?.schemas ?? {})).toEqual(
        expect.arrayContaining(['OAuthAuthorizationServerMetadata', 'OAuthProtectedResourceMetadata']),
      );
    });
  });
});
