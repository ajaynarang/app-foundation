import { ForbiddenException, Logger, UnauthorizedException, type ArgumentsHost } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BearerChallengeFilter } from '../bearer-challenge.filter';

function host(path: string, authorization?: string) {
  const res = { removeHeader: jest.fn(), setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  const req = { path, url: path, method: 'POST', headers: authorization ? { authorization } : {} };
  const h = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ArgumentsHost;
  return { h, res };
}

const config = (settings: Record<string, string>) => ({ get: (k: string) => settings[k] }) as unknown as ConfigService;

describe('BearerChallengeFilter', () => {
  const filter = new BearerChallengeFilter(config({ oauthIssuer: 'https://api.example.com/' }));
  const unauthorized = new UnauthorizedException({
    error: 'invalid_token',
    error_description: 'Bearer token required',
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('a rejected token gets the challenge with invalid_token and the RFC 9728 document, and the usual envelope', () => {
    const { h, res } = host('/api/v1/mcp', 'Bearer bad');
    filter.catch(unauthorized, h);
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer error="invalid_token", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
    );
    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED', detail: 'Bearer token required' });
    expect(body).not.toHaveProperty('error');
    expect(body).not.toHaveProperty('error_description');
  });

  it('a token-less call gets the bare challenge (a first discovery call is not an invalid token)', () => {
    const { h, res } = host('/');
    filter.catch(unauthorized, h);
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
    );
  });

  it('catches only a 401: the decorator names UnauthorizedException', () => {
    const caught = Reflect.getMetadata('__filterCatchExceptions__', BearerChallengeFilter) as unknown[];
    expect(caught).toEqual([UnauthorizedException]);
    expect(caught).not.toContain(ForbiddenException);
  });

  it('refuses to be built without an issuer: a challenge to a made-up origin sends the client nowhere', () => {
    expect(() => new BearerChallengeFilter(config({}))).toThrow(/oauthIssuer/);
  });
});
