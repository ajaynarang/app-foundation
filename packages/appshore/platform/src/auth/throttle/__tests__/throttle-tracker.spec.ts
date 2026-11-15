import { JwtService } from '@nestjs/jwt';
import { ThrottleTracker } from '../throttle-tracker';
import { clientIp } from '../client-ip';

const SETTINGS: Record<string, string> = {
  'jwt.accessSecret': 'session-secret',
  secretKey: 'base',
  oauthIssuer: 'https://api.acme.io',
};
const read = (key: string) => SETTINGS[key];
const jwt = new JwtService();
const req = (authorization?: string, ip = '203.0.113.7') => ({ headers: { authorization }, ip });

describe('ThrottleTracker', () => {
  const tracker = new ThrottleTracker(read);

  it('counts a verified session JWT against the user, whatever IP it comes from', () => {
    const token = jwt.sign({ sub: 'u_42', tenantId: 1 }, { secret: 'session-secret' });
    expect(tracker.resolve(req(`Bearer ${token}`))).toBe('user:u_42');
    expect(tracker.resolve(req(`Bearer ${token}`, '198.51.100.9'))).toBe('user:u_42');
  });

  it('counts a verified OAuth access token against the client acting for that user', () => {
    const token = jwt.sign(
      { sub: '42', clientId: 'app_x', scopes: [] },
      { secret: 'base-oauth', issuer: 'https://api.acme.io' },
    );
    expect(tracker.resolve(req(`Bearer ${token}`))).toBe('oauth:app_x:42');
  });

  it('uses the configured OAuth secret when one is set', () => {
    const configured = new ThrottleTracker((key) => (key === 'oauthJwtSecret' ? 'explicit-oauth' : read(key)));
    const token = jwt.sign(
      { sub: '42', clientId: 'app_x' },
      { secret: 'explicit-oauth', issuer: 'https://api.acme.io' },
    );
    expect(configured.resolve(req(`Bearer ${token}`))).toBe('oauth:app_x:42');
    expect(tracker.resolve(req(`Bearer ${token}`))).toBe('ip:203.0.113.7');
  });

  it('counts a public route by IP even with a verified session or OAuth token attached', () => {
    const session = jwt.sign({ sub: 'u_42' }, { secret: 'session-secret' });
    const oauth = jwt.sign({ sub: '42', clientId: 'app_x' }, { secret: 'base-oauth', issuer: 'https://api.acme.io' });
    expect(tracker.resolve(req(`Bearer ${session}`), { isPublic: true })).toBe('ip:203.0.113.7');
    expect(tracker.resolve(req(`Bearer ${oauth}`), { isPublic: true })).toBe('ip:203.0.113.7');
    expect(tracker.resolve(req(`Bearer ${session}`), { isPublic: false })).toBe('user:u_42');
  });

  it('on a public route that an OAuth guard protects, a verified OAuth token keeps its own bucket', () => {
    const route = { isPublic: true, oauthGuarded: true };
    const oauth = jwt.sign({ sub: '42', clientId: 'app_x' }, { secret: 'base-oauth', issuer: 'https://api.acme.io' });
    const session = jwt.sign({ sub: 'u_42' }, { secret: 'session-secret' });
    const forged = jwt.sign({ sub: '42', clientId: 'app_x' }, { secret: 'attacker', issuer: 'https://api.acme.io' });

    expect(tracker.resolve(req(`Bearer ${oauth}`), route)).toBe('oauth:app_x:42');
    // A session does not authenticate there, so it must not buy a bucket; neither does a forgery or no bearer.
    expect(tracker.resolve(req(`Bearer ${session}`), route)).toBe('ip:203.0.113.7');
    expect(tracker.resolve(req(`Bearer ${forged}`), route)).toBe('ip:203.0.113.7');
    expect(tracker.resolve(req(undefined), route)).toBe('ip:203.0.113.7');
  });

  it('falls back to the IP for a forged token (a fresh bucket per forgery would bypass the limit)', () => {
    const forged = jwt.sign({ sub: 'u_1' }, { secret: 'attacker' });
    expect(tracker.resolve(req(`Bearer ${forged}`))).toBe('ip:203.0.113.7');
  });

  it('falls back to the IP for an expired session token', () => {
    const expired = jwt.sign({ sub: 'u_1', exp: Math.floor(Date.now() / 1000) - 60 }, { secret: 'session-secret' });
    expect(tracker.resolve(req(`Bearer ${expired}`))).toBe('ip:203.0.113.7');
  });

  it('falls back to the IP for an OAuth token from another issuer', () => {
    const token = jwt.sign({ sub: '42', clientId: 'app_x' }, { secret: 'base-oauth', issuer: 'https://elsewhere.io' });
    expect(tracker.resolve(req(`Bearer ${token}`))).toBe('ip:203.0.113.7');
  });

  it('counts API keys and anonymous calls by IP (keys are limited per key after validation)', () => {
    expect(tracker.resolve(req('Bearer sk_live_abc'))).toBe('ip:203.0.113.7');
    expect(tracker.resolve(req('Bearer sk_live_other'))).toBe('ip:203.0.113.7');
    expect(tracker.resolve(req(undefined))).toBe('ip:203.0.113.7');
    expect(tracker.resolve(req('Basic abc'))).toBe('ip:203.0.113.7');
    expect(tracker.resolve({ headers: { authorization: ['Bearer a.b.c'] }, ip: '198.51.100.1' })).toBe(
      'ip:198.51.100.1',
    );
  });

  it('a session-signed token that carries a clientId is not a session', () => {
    const odd = jwt.sign({ sub: 'u_1', clientId: 'app_x' }, { secret: 'session-secret' });
    expect(tracker.resolve(req(`Bearer ${odd}`))).toBe('ip:203.0.113.7');
  });

  it('without a session secret configured, never trusts a session token', () => {
    const bare = new ThrottleTracker((key) => (key === 'jwt.accessSecret' ? undefined : read(key)));
    const token = jwt.sign({ sub: 'u_1' }, { secret: 'session-secret' });
    expect(bare.resolve(req(`Bearer ${token}`))).toBe('ip:203.0.113.7');
  });
});

describe('clientIp', () => {
  it('folds IPv4-mapped IPv6 to IPv4', () => {
    expect(clientIp({ ip: '::ffff:10.0.0.5' })).toBe('10.0.0.5');
  });
  it('keeps real IPv6 and plain IPv4', () => {
    expect(clientIp({ ip: '2001:db8::1' })).toBe('2001:db8::1');
    expect(clientIp({ ip: '203.0.113.7' })).toBe('203.0.113.7');
  });
  it('falls back to the socket, then to "unknown"', () => {
    expect(clientIp({ socket: { remoteAddress: '::ffff:127.0.0.1' } })).toBe('127.0.0.1');
    expect(clientIp({})).toBe('unknown');
  });
});
