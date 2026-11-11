import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  INestApplication,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerException } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { z } from 'zod';
import { Prisma } from '@appshore/db';
import { API_ERROR_ENVELOPE_KEYS, ApiErrorCode } from '@app/shared-types';
import { HttpExceptionFilter } from '@appshore/platform/shared/filters/http-exception.filter';
import { AppValidationPipe } from '@appshore/kernel/shared/utils/app-validation-pipe';
import { duplicate, fieldError, invalidState, stale } from '@appshore/kernel/shared/errors/api-errors';

/**
 * ADR "API contract", section 2: every error leaves through the one envelope, whatever threw it. The filter is
 * booted for real (global APP_FILTER + the app's validation pipe), each route throws one kind of error, and every
 * body must hold only the whitelisted keys, a machine `code`, and user-facing `detail`.
 */

class CreateThingDto {
  @IsString()
  @MinLength(3)
  title!: string;
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('raw db text', { code, clientVersion: 'x', meta: { target: ['email'] } });

@Controller('e')
class ThrowingController {
  @Get('string-404') s404() {
    throw new NotFoundException('This project was not found');
  }
  @Get('nest-object') nestObject() {
    throw new BadRequestException({ message: 'Bad thing', error: 'Bad Request' });
  }
  @Get('message-array') messageArray() {
    throw new BadRequestException(['first problem', 'second problem']);
  }
  @Get('int/:id') int(@Param('id', ParseIntPipe) id: number) {
    return id;
  }
  @Post('dto') dto(@Body() body: CreateThingDto) {
    return body;
  }
  @Get('zod') zod() {
    z.object({ limit: z.number().max(10) }).parse({ limit: 50 });
  }
  @Get('field') field() {
    throw fieldError('sort', 'Unknown sort option');
  }
  @Get('invalid-state') invalid() {
    throw invalidState('This ticket is already closed.');
  }
  @Get('stale') staleRoute() {
    throw stale('This ticket was just updated by someone else — refresh and try again');
  }
  @Get('duplicate') dup() {
    throw duplicate('A workspace with this name already exists');
  }
  @Get('extras') extras() {
    throw new ForbiddenException({ detail: 'No', reasons: ['X'], budget: 3, issues: [{ path: ['a'] }] });
  }
  @Get('domain-code') domainCode() {
    // The plan guard's own shape: its `code` passes through, its `feature` key does not.
    throw new ForbiddenException({
      code: 'FEATURE_DISABLED',
      feature: 'api_keys',
      message: 'This feature is currently unavailable.',
    });
  }
  @Get('rfc-keys') rfcKeys() {
    throw new BadRequestException({ error: 'invalid_grant', error_description: 'Code expired' });
  }
  @Get('unauthorized') unauthorized() {
    throw new UnauthorizedException();
  }
  @Get('throttled') throttled() {
    throw new ThrottlerException();
  }
  @Get('teapot') teapot() {
    throw new HttpException('Upstream unavailable', 503);
  }
  @Get('p2002') p2002() {
    throw prismaError('P2002');
  }
  @Get('p2025') p2025() {
    throw prismaError('P2025');
  }
  @Get('p2003') p2003() {
    throw prismaError('P2003');
  }
  @Get('p2014') p2014() {
    throw prismaError('P2014');
  }
  @Get('p2007') p2007() {
    throw prismaError('P2007');
  }
  @Get('p9999') p9999() {
    throw prismaError('P9999');
  }
  @Get('boom') boom() {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 secret');
  }
}

describe('the error envelope', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());

  const call = async (path: string, method: 'get' | 'post' = 'get', body?: object) => {
    const res = await request(app.getHttpServer())[method](`/e/${path}`).send(body);
    for (const key of Object.keys(res.body)) expect(API_ERROR_ENVELOPE_KEYS).toContain(key);
    expect(res.body).toMatchObject({ statusCode: res.status, path: `/e/${path}`, method: method.toUpperCase() });
    expect(typeof res.body.code).toBe('string');
    expect(typeof res.body.detail).toBe('string');
    expect(res.body.message).toBeUndefined();
    expect(res.body.error).toBeUndefined();
    expect(res.body.debugDetail).toBeUndefined(); // not development
    return res;
  };

  it.each([
    ['string-404', 404, ApiErrorCode.NOT_FOUND, 'This project was not found'],
    ['nest-object', 400, ApiErrorCode.VALIDATION_FAILED, 'Bad thing'],
    ['message-array', 400, ApiErrorCode.VALIDATION_FAILED, 'first problem'],
    ['int/abc', 400, ApiErrorCode.VALIDATION_FAILED, expect.any(String)],
    ['invalid-state', 409, ApiErrorCode.INVALID_STATE, 'This ticket is already closed.'],
    ['stale', 409, ApiErrorCode.STALE, expect.stringContaining('refresh')],
    ['duplicate', 409, ApiErrorCode.DUPLICATE, 'A workspace with this name already exists'],
    ['domain-code', 403, 'FEATURE_DISABLED', 'This feature is currently unavailable.'],
    ['rfc-keys', 400, ApiErrorCode.VALIDATION_FAILED, 'Code expired'],
    ['unauthorized', 401, ApiErrorCode.UNAUTHENTICATED, 'Sign in to continue.'],
    ['throttled', 429, ApiErrorCode.RATE_LIMITED, 'Too many requests. Please wait a moment and try again.'],
    ['teapot', 503, ApiErrorCode.UNAVAILABLE, 'Upstream unavailable'],
    ['p2002', 409, ApiErrorCode.DUPLICATE, expect.stringContaining('already exists')],
    ['p2025', 404, ApiErrorCode.NOT_FOUND, expect.any(String)],
    ['p2003', 409, ApiErrorCode.INVALID_STATE, expect.any(String)],
    ['p2014', 409, ApiErrorCode.INVALID_STATE, expect.any(String)],
    ['p2007', 400, ApiErrorCode.VALIDATION_FAILED, expect.any(String)],
    ['p9999', 500, ApiErrorCode.INTERNAL, 'A database error occurred. Please try again.'],
  ])('%s → %i %s', async (path, status, code, detail) => {
    const res = await call(path);
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ code, detail });
    expect(res.body.fieldErrors).toBeUndefined();
  });

  it('an unknown error is a generic 500 that leaks nothing', async () => {
    const res = await call('boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe(ApiErrorCode.INTERNAL);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|secret|10\.0\.0\.5/);
  });

  it('a DTO failure is 400 VALIDATION_FAILED with fieldErrors', async () => {
    const res = await call('dto', 'post', { title: 'x', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(res.body.fieldErrors).toEqual({ title: expect.any(String), extra: expect.any(String) });
  });

  it('a ZodError is 400 VALIDATION_FAILED with fieldErrors, never a 500', async () => {
    const res = await call('zod');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED,
      fieldErrors: { limit: expect.any(String) },
    });
  });

  it('fieldError names its field', async () => {
    const res = await call('field');
    expect(res.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED,
      fieldErrors: { sort: 'Unknown sort option' },
    });
  });

  it('drops every key a thrower attached that the envelope does not name', async () => {
    // `call` already fails on any key outside API_ERROR_ENVELOPE_KEYS; these name the ones that used to leak.
    const extras = await call('extras');
    expect(extras.status).toBe(403);
    expect(extras.body.code).toBe(ApiErrorCode.FORBIDDEN);
    for (const key of ['reasons', 'budget', 'issues']) expect(extras.body).not.toHaveProperty(key);
    const planGuard = await call('domain-code');
    expect(planGuard.body).not.toHaveProperty('feature');
  });

  it('the whitelist is exactly the eight keys of the contract', () => {
    expect([...API_ERROR_ENVELOPE_KEYS]).toEqual([
      'statusCode',
      'code',
      'detail',
      'fieldErrors',
      'timestamp',
      'path',
      'method',
      'debugDetail',
    ]);
  });

  it('debugDetail appears only in development', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = await request(app.getHttpServer()).get('/e/boom');
      expect(res.body.debugDetail).toContain('ECONNREFUSED');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
