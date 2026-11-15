import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import request from 'supertest';
import { applyTrustProxy, resolveTrustProxy } from '../trust-proxy';

describe('resolveTrustProxy', () => {
  it('trusts exactly the load balancer hop in production by default, nothing elsewhere', () => {
    expect(resolveTrustProxy(undefined, 'production')).toBe(1);
    expect(resolveTrustProxy('', 'production')).toBe(1);
    expect(resolveTrustProxy(undefined, 'development')).toBe(false);
    expect(resolveTrustProxy(undefined, undefined)).toBe(false);
  });

  it('honours TRUST_PROXY as a hop count, off switch or subnet list', () => {
    expect(resolveTrustProxy('2', 'production')).toBe(2);
    expect(resolveTrustProxy('1', 'development')).toBe(1);
    expect(resolveTrustProxy('false', 'production')).toBe(false);
    expect(resolveTrustProxy('0', 'production')).toBe(false);
    expect(resolveTrustProxy(' loopback, 10.0.0.0/8 ', 'production')).toBe('loopback, 10.0.0.0/8');
  });

  it('refuses "true": every hop trusted means any client picks its own IP', () => {
    expect(() => resolveTrustProxy('true', 'production')).toThrow(/TRUST_PROXY=true/);
  });
});

describe('applyTrustProxy (real Express)', () => {
  function appWith(value: string | undefined, env: string) {
    const app = express();
    applyTrustProxy(app, value, env);
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    return app;
  }

  it('behind one load balancer hop, req.ip is the client the balancer appended, not a spoofed left-most entry', async () => {
    const res = await request(appWith(undefined, 'production'))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
    expect(res.body.ip).toBe('203.0.113.7');
  });

  it('with no proxy trusted (dev), X-Forwarded-For is ignored', async () => {
    const res = await request(appWith(undefined, 'development')).get('/ip').set('X-Forwarded-For', '203.0.113.7');
    expect(res.body.ip).not.toBe('203.0.113.7');
  });

  it('with two hops configured (a CDN in front of the balancer), req.ip is two entries from the right', async () => {
    const res = await request(appWith('2', 'production'))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7, 10.0.0.9');
    expect(res.body.ip).toBe('203.0.113.7');
  });
});

describe('main.ts bootstrap', () => {
  const main = readFileSync(join(__dirname, '..', '..', 'main.ts'), 'utf8');

  it('applies trust proxy from config before the server listens', () => {
    const applied = main.indexOf('applyTrustProxy(app,');
    expect(applied).toBeGreaterThan(-1);
    expect(main.slice(applied, applied + 200)).toContain('trustProxy');
    expect(applied).toBeLessThan(main.indexOf('app.listen('));
  });
});
