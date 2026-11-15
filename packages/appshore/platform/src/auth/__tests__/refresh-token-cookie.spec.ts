import type { Response } from 'express';
import { clearRefreshTokenCookie, setRefreshTokenCookie } from '../refresh-token-cookie';
import {
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from '../../constants/auth.constants';

/**
 * The refresh cookie must reach the API host and nothing else. A `Domain`
 * attribute would share the refresh token with every subdomain, so these fail
 * if one is ever set on the live cookie.
 */
describe('refresh token cookie', () => {
  const response = () => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    return res as typeof res & Response;
  };

  it('is set host-only: httpOnly, lax, scoped to the auth path, with no Domain', () => {
    const res = response();

    setRefreshTokenCookie(res, 'rt', { secure: true });

    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, 'rt', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    });
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('is still set with no Domain when a deployment configures COOKIE_DOMAIN', () => {
    const res = response();

    setRefreshTokenCookie(res, 'rt', { secure: true, legacyDomain: '.acme.io' });

    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie.mock.calls[0][2]).not.toHaveProperty('domain');
  });

  it('expires the cookie an earlier version issued with a Domain, so two cookies of one name cannot coexist', () => {
    const res = response();

    setRefreshTokenCookie(res, 'rt', { secure: true, legacyDomain: '.acme.io' });

    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      domain: '.acme.io',
    });
  });

  it('is cleared with the same attributes it was set with, and no Domain', () => {
    const res = response();

    clearRefreshTokenCookie(res, { secure: false });

    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  });

  it('logout also expires a legacy Domain cookie', () => {
    const res = response();

    clearRefreshTokenCookie(res, { secure: true, legacyDomain: '.acme.io' });

    const domains = res.clearCookie.mock.calls.map(([, options]) => (options as { domain?: string }).domain);
    expect(domains).toEqual(['.acme.io', undefined]);
  });
});
