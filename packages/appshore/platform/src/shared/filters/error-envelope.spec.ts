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

  it("maps the body parser's over-limit error to 413 PAYLOAD_TOO_LARGE, logged as a warning", () => {
    // What body-parser raises (an http-errors error, not a Nest HttpException) when a body passes the limit.
    const tooLarge = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
      statusCode: 413,
      limit: 102400,
      length: 300000,
    });
    expect(errorShapeOf(tooLarge)).toEqual({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      detail: 'This request is too large. Send less data and try again.',
      debugDetail: 'request entity too large',
    });
    buildErrorEnvelope(tooLarge, req);
    expect(Logger.prototype.error).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('trusts no other status a plain error carries: it stays a generic 500', () => {
    const odd = Object.assign(new Error('upstream said no'), { status: 403, statusCode: 403 });
    expect(errorShapeOf(odd)).toMatchObject({ status: 500, code: 'INTERNAL' });
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

  describe('the workspaces key (login with duplicate accounts)', () => {
    const selection = (workspaces: unknown, code = 'WORKSPACE_SELECTION_REQUIRED') =>
      new ConflictException({ code, detail: 'Choose a workspace to sign in to.', workspaces });

    it('passes the workspace choices through on WORKSPACE_SELECTION_REQUIRED', () => {
      const envelope = buildErrorEnvelope(
        selection([
          { tenantId: 'ten_a', name: 'Acme' },
          { tenantId: 'ten_b', name: 'Beta' },
        ]),
        req,
      );
      expect(envelope).toMatchObject({
        statusCode: 409,
        code: 'WORKSPACE_SELECTION_REQUIRED',
        workspaces: [
          { tenantId: 'ten_a', name: 'Acme' },
          { tenantId: 'ten_b', name: 'Beta' },
        ],
      });
      for (const key of Object.keys(envelope)) expect(API_ERROR_ENVELOPE_KEYS).toContain(key);
    });

    it('drops the key for every other code: only the workspace-selection code sets it', () => {
      const envelope = buildErrorEnvelope(selection([{ tenantId: 'ten_a', name: 'Acme' }], 'INVALID_STATE'), req);
      expect(envelope).not.toHaveProperty('workspaces');
    });

    it('keeps only { tenantId, name } string pairs; anything else a thrower attached is dropped', () => {
      const envelope = buildErrorEnvelope(
        selection([
          { tenantId: 'ten_a', name: 'Acme', id: 7, passwordHash: 'x' },
          { tenantId: 5, name: 'Numeric key' },
          'ten_c',
          { tenantId: 'ten_d' },
        ]),
        req,
      );
      expect(envelope.workspaces).toEqual([{ tenantId: 'ten_a', name: 'Acme' }]);
    });

    it('omits the key when no valid choice is left', () => {
      expect(buildErrorEnvelope(selection('nope'), req)).not.toHaveProperty('workspaces');
      expect(buildErrorEnvelope(selection([]), req)).not.toHaveProperty('workspaces');
    });
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
