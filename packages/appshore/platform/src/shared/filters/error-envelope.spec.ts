import { ConflictException, ForbiddenException, HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import { API_ERROR_ENVELOPE_KEYS } from '@app/shared-types';
import { ThrottlerException } from '@nestjs/throttler';
import { z } from 'zod';
import { Prisma } from '@appshore/db';
import { buildErrorEnvelope, errorShapeOf, writeErrorEnvelope } from './error-envelope';

const req = { url: '/api/v1/things', method: 'POST' };

function fakeResponse(headersSent = false) {
  const res: any = { headersSent, removeHeader: jest.fn(), setHeader: jest.fn() };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('error-envelope', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes the envelope before headers are sent', () => {
    const res = fakeResponse();
    expect(writeErrorEnvelope(res, req, new ConflictException('Already decided'))).toBe(true);
    expect(res.status).toHaveBeenCalledWith(409);
    // A stream's staged chunked headers never ride on the JSON envelope.
    expect(res.removeHeader).toHaveBeenCalledWith('Transfer-Encoding');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, code: 'INVALID_STATE', detail: 'Already decided', method: 'POST' }),
    );
  });

  it('writes nothing once headers are out — the stream ends with an error frame instead', () => {
    const res = fakeResponse(true);
    expect(writeErrorEnvelope(res, req, new Error('late'))).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('maps a Prisma validation error to 400 VALIDATION_FAILED and P2014 to 409', () => {
    const validation = new Prisma.PrismaClientValidationError('bad', { clientVersion: 'x' });
    expect(errorShapeOf(validation)).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    const p2014 = new Prisma.PrismaClientKnownRequestError('rel', { code: 'P2014', clientVersion: 'x' });
    expect(errorShapeOf(p2014)).toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });

  it('reads an RFC error_description as the detail when no detail is given', () => {
    const e = new ConflictException({ error: 'invalid_grant', error_description: 'Code expired' });
    expect(errorShapeOf(e).detail).toBe('Code expired');
  });

  it('logs 5xx as error and 4xx as warn, skipping silent paths', () => {
    buildErrorEnvelope(new Error('boom'), req);
    expect(Logger.prototype.error).toHaveBeenCalled();
    buildErrorEnvelope(new ConflictException('x'), req);
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    buildErrorEnvelope(new ConflictException('x'), { url: '/api/v1/health/live', method: 'GET' });
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('stringifies a non-Error throw into debugDetail only', () => {
    expect(errorShapeOf({ weird: true })).toMatchObject({ status: 500, debugDetail: '{"weird":true}' });
  });

  it.each([
    ['P2002', 409, 'DUPLICATE'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2003', 409, 'INVALID_STATE'],
    ['P2007', 400, 'VALIDATION_FAILED'],
    ['P9999', 500, 'INTERNAL'],
  ])('maps Prisma %s to %i %s', (code, status, apiCode) => {
    const e = new Prisma.PrismaClientKnownRequestError('raw', {
      code,
      clientVersion: 'x',
      meta: { target: ['email'] },
    });
    expect(errorShapeOf(e)).toMatchObject({ status, code: apiCode });
  });

  it('a ZodError is a 400 with fieldErrors (several fields summarised)', () => {
    const result = z.object({ a: z.string(), b: z.number() }).safeParse({});
    const shape = errorShapeOf(!result.success && result.error);
    expect(shape).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', detail: '2 fields are missing or invalid' });
    expect(Object.keys(shape.fieldErrors ?? {})).toEqual(['a', 'b']);
  });

  it('drops every key a thrower attached that the envelope does not name, and keeps a domain code', () => {
    // The plan guard's shape: `feature` used to be spread onto the wire.
    const planGuard = new ForbiddenException({
      code: 'FEATURE_DISABLED',
      feature: 'api_keys',
      message: 'This feature is currently unavailable.',
    });
    const envelope = buildErrorEnvelope(planGuard, req);
    for (const key of Object.keys(envelope)) expect(API_ERROR_ENVELOPE_KEYS).toContain(key);
    expect(envelope).toMatchObject({
      statusCode: 403,
      code: 'FEATURE_DISABLED',
      detail: 'This feature is currently unavailable.',
    });
    expect(envelope).not.toHaveProperty('feature');
    expect(envelope).not.toHaveProperty('message');

    const extras = buildErrorEnvelope(new ConflictException({ detail: 'x', reasons: ['A'], issues: [{ a: 1 }] }), req);
    expect(Object.keys(extras).sort()).toEqual(['code', 'detail', 'method', 'path', 'statusCode', 'timestamp']);
  });

  it("replaces Nest's bare defaults and the throttler text with copy a person can act on", () => {
    expect(errorShapeOf(new UnauthorizedException()).detail).toBe('Sign in to continue.');
    expect(errorShapeOf(new ThrottlerException()).detail).toMatch(/Too many requests/);
    expect(errorShapeOf(new HttpException({}, 500)).detail).toMatch(/Something went wrong/);
    expect(errorShapeOf(new HttpException({}, 418)).detail).toBe('Request failed');
  });

  it("keeps a thrower's own 429 copy — only the throttler's bare text (or none) becomes the generic line", () => {
    const explained = new HttpException('A code was sent 3 minutes ago — wait before asking for another', 429);
    expect(errorShapeOf(explained)).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      detail: 'A code was sent 3 minutes ago — wait before asking for another',
    });
    expect(errorShapeOf(new HttpException({ code: 'RATE_LIMITED', detail: 'Agent budget' }, 429)).detail).toBe(
      'Agent budget',
    );
    expect(errorShapeOf(new HttpException({}, 429)).detail).toMatch(/Too many requests/);
    expect(errorShapeOf(new HttpException('Too Many Requests', 429)).detail).toMatch(/Too many requests/);
  });

  it('drops fieldErrors off a 400 and non-string messages, and survives a circular throw', () => {
    expect(errorShapeOf(new ConflictException({ detail: 'x', fieldErrors: { a: 'b' } })).fieldErrors).toBeUndefined();
    const nested = new (require('@nestjs/common').BadRequestException)({
      detail: 'x',
      fieldErrors: { a: 'ok', b: { deep: 1 } },
    });
    expect(errorShapeOf(nested).fieldErrors).toEqual({ a: 'ok' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorShapeOf(circular)).toMatchObject({ status: 500, debugDetail: '[object Object]' });
  });
});
