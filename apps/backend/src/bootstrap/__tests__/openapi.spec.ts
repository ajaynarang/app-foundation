import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { SkipIdempotency } from '@appshore/platform/infrastructure/idempotency/idempotency.interceptor';
import { UserRole } from '@appshore/db';
import { ApiResult, defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { applyGlobalPrefix, buildOpenApiDocument, sortKeys } from '../openapi';

const WidgetResponse = defineResponseSchema('OpenApiSpecWidget', z.object({ id: z.string(), size: z.number().int() }));

class CreateWidgetDto {
  @ApiProperty()
  name!: string;
}

@ApiTags('Widgets')
@ApiBearerAuth()
@Controller('widgets')
class WidgetsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a widget' })
  @ApiResult(WidgetResponse, HttpStatus.CREATED)
  create(@Body() _dto: CreateWidgetDto) {}

  @Post(':widget_id/polish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Polish a widget' })
  @ApiParam({ name: 'widget_id', description: 'The widget' })
  @ApiNotFoundResponse({ description: 'No such widget' })
  @ApiResult(WidgetResponse)
  polish(@Param('widget_id') _id: string) {}

  @Public()
  @Post('public')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'A public create' })
  open() {}

  @Post('secret')
  @HttpCode(HttpStatus.CREATED)
  @SkipIdempotency()
  @ApiOperation({ summary: 'Mint a secret shown once' })
  mint() {}

  @Post('platform')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'A super-admin create, outside any tenant' })
  platformCreate() {}

  @Post('queued')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a widget' })
  queue() {}

  @Get()
  @ApiOperation({ summary: 'List' })
  list() {}
}

@Module({ controllers: [WidgetsController] })
class WidgetsModule {}

describe('buildOpenApiDocument', () => {
  let doc: Record<string, any>;

  beforeAll(async () => {
    const app = await NestFactory.create(WidgetsModule, { preview: true, logger: false });
    applyGlobalPrefix(app);
    doc = buildOpenApiDocument(app) as never;
    await app.close();
  });

  it('is the App API at the package version, served from the origin unless a server is named', () => {
    expect(doc.info).toMatchObject({ title: 'App API', version: expect.stringMatching(/^\d+\.\d+\.\d+/) });
    expect(doc.servers).toEqual([{ url: '/', description: expect.any(String) }]);
    expect(Object.keys(doc.paths)).toContain('/api/v1/widgets');
  });

  it('publishes every named response schema, converted from Zod', () => {
    expect(doc.components.schemas.OpenApiSpecWidget).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' }, size: { type: 'integer' } },
    });
    expect(doc.paths['/api/v1/widgets'].post.responses['201'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/OpenApiSpecWidget',
    });
  });

  it('every error is the envelope: a default response, and any 4xx the route names', () => {
    const envelope = { $ref: '#/components/schemas/ApiErrorEnvelope' };
    const polish = doc.paths['/api/v1/widgets/{widget_id}/polish'].post;
    expect(polish.responses.default.content['application/json'].schema).toEqual(envelope);
    expect(polish.responses['404'].content['application/json'].schema).toEqual(envelope);
    expect(doc.components.schemas.ApiErrorEnvelope.properties).toHaveProperty('code');
  });

  it('documents Idempotency-Key on exactly the creates the interceptor honours', () => {
    const header = (op: Record<string, any>) =>
      (op.parameters ?? []).some(
        (p: { name: string; in: string }) => p.name === 'Idempotency-Key' && p.in === 'header',
      );
    expect(header(doc.paths['/api/v1/widgets'].post)).toBe(true);
    expect(header(doc.paths['/api/v1/widgets/queued'].post)).toBe(true);
    expect(header(doc.paths['/api/v1/widgets/{widget_id}/polish'].post)).toBe(false);
    expect(header(doc.paths['/api/v1/widgets/public'].post)).toBe(false);
    expect(header(doc.paths['/api/v1/widgets/secret'].post)).toBe(false);
    expect(header(doc.paths['/api/v1/widgets/platform'].post)).toBe(false);
    expect(header(doc.paths['/api/v1/widgets'].get)).toBe(false);
  });

  it('names a configured server', async () => {
    const app = await NestFactory.create(WidgetsModule, { preview: true, logger: false });
    expect(buildOpenApiDocument(app, { serverUrl: 'https://api.example.com' }).servers).toEqual([
      { url: 'https://api.example.com', description: 'This deployment' },
    ]);
    await app.close();
  });

  it('sorts keys at every depth and keeps array order', () => {
    expect(JSON.stringify(sortKeys({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } }))).toBe(
      '{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });
});
