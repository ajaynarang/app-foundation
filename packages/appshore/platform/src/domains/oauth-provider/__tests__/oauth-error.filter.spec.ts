import { BadRequestException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as errorTracking from '@appshore/kernel/infrastructure/error-tracking/sentry';
import { OAuthErrorFilter, oauthError, OAUTH_ERROR } from '../oauth-error.filter';

function hostFor(headersSent = false) {
  const res: any = { headersSent, setHeader: jest.fn() };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  const req = { url: '/api/v1/oauth/token', method: 'POST' };
  const host: any = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) };
  return { res, host };
}

describe('OAuthErrorFilter (RFC 6749 §5.2 / RFC 7591 §3.2.2)', () => {
  const filter = new OAuthErrorFilter();
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const answer = (exception: unknown) => {
    const { res, host } = hostFor();
    filter.catch(exception, host);
    const body = res.json.mock.calls[0][0];
    expect(Object.keys(body).sort()).toEqual(['error', 'error_description']);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    return { status: res.status.mock.calls[0][0], body };
  };

  it('passes an explicit RFC code through with its status', () => {
    expect(answer(oauthError(OAUTH_ERROR.INVALID_GRANT, 'Code expired'))).toEqual({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'Code expired' },
    });
    expect(answer(oauthError(OAUTH_ERROR.INVALID_CLIENT, 'Bad secret', 401)).status).toBe(401);
  });

  it('keeps a ProtocolWireDto code (RFC 7591) from the validation pipe', () => {
    const e = new BadRequestException({ detail: 'Bad uri', error: 'invalid_redirect_uri', fieldErrors: { a: 'b' } });
    expect(answer(e).body).toEqual({ error: 'invalid_redirect_uri', error_description: 'Bad uri' });
  });

  it.each([
    [new BadRequestException('Missing'), 400, 'invalid_request'],
    [new BadRequestException({ message: 'x', error: 'Bad Request' }), 400, 'invalid_request'],
    [new NotFoundException('gone'), 404, 'invalid_request'],
    [new UnauthorizedException(), 401, 'invalid_client'],
    [new ThrottlerException(), 429, 'temporarily_unavailable'],
    [new Error('db down'), 500, 'server_error'],
  ])('derives the code from the status when none is given (%#)', (exception, status, error) => {
    const out = answer(exception);
    expect(out.status).toBe(status);
    expect(out.body.error).toBe(error);
  });

  it('access_denied for a 403 and a generic description for a 500', () => {
    const { res, host } = hostFor();
    filter.catch(new (require('@nestjs/common').ForbiddenException)(), host);
    expect(res.json.mock.calls[0][0].error).toBe('access_denied');
    expect(answer(new Error('secret internals')).body.error_description).not.toContain('secret');
  });

  it('writes nothing once headers are sent', () => {
    const { res, host } = hostFor(true);
    filter.catch(new BadRequestException('x'), host);
    expect(res.status).not.toHaveBeenCalled();
  });

  // This filter writes the body on the OAuth routes instead of writeErrorEnvelope, so it is where their 5xx is reported.
  // reportServerError drops a status under 500 itself (sentry.spec.ts); here each answer passes its own status.
  describe('error tracking', () => {
    it('reports a 5xx once with its status, after the body is written', () => {
      const report = jest.spyOn(errorTracking, 'reportServerError').mockImplementation(() => undefined);
      const { res, host } = hostFor();
      const error = new Error('db down');

      filter.catch(error, host);

      expect(res.json).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledWith(error, 500);
      expect(report.mock.invocationCallOrder[0]).toBeGreaterThan(res.json.mock.invocationCallOrder[0]);
    });

    it.each([
      ['a 400', oauthError(OAUTH_ERROR.INVALID_GRANT, 'Code expired'), 400],
      ['a 401', new UnauthorizedException(), 401],
      ['a 429', new ThrottlerException(), 429],
    ])('passes %s on with its client status, which reportServerError drops', (_label, exception, status) => {
      const report = jest.spyOn(errorTracking, 'reportServerError').mockImplementation(() => undefined);
      const { host } = hostFor();

      filter.catch(exception, host);

      expect(report.mock.calls).toEqual([[exception, status]]);
      expect(status).toBeLessThan(500);
    });

    it('reports nothing once headers are sent', () => {
      const report = jest.spyOn(errorTracking, 'reportServerError').mockImplementation(() => undefined);
      const { host } = hostFor(true);

      filter.catch(new Error('db down'), host);

      expect(report).not.toHaveBeenCalled();
    });
  });
});
