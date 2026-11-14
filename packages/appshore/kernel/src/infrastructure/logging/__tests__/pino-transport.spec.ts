import { buildPinoTransport } from '../pino-transport';

interface Target {
  target: string;
  level?: string;
  options: Record<string, any>;
}

function targetsOf(): Target[] {
  return (buildPinoTransport() as unknown as { targets: Target[] }).targets;
}

function lokiOptions(): Record<string, any> {
  const loki = targetsOf().find((t) => t.target === 'pino-loki');
  if (!loki) throw new Error('no pino-loki target');
  return loki.options;
}

describe('buildPinoTransport', () => {
  const originalEnv = { ...process.env };
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    for (const key of [
      'LOG_TRANSPORT',
      'LOKI_URL',
      'LOKI_USERNAME',
      'LOKI_PASSWORD',
      'OTEL_SERVICE_NAME',
      'ENV_TYPE',
      'LOG_LEVEL',
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  describe('without Loki', () => {
    it('returns undefined (plain JSON on stdout) in production when LOG_TRANSPORT is unset', () => {
      process.env.NODE_ENV = 'production';

      expect(buildPinoTransport()).toBeUndefined();
    });

    it('returns pino-pretty in development when LOG_TRANSPORT is unset', () => {
      process.env.NODE_ENV = 'development';

      expect(buildPinoTransport()).toMatchObject({ target: 'pino-pretty' });
    });

    it('stays on plain stdout in production when LOG_TRANSPORT=loki but LOKI_URL is unset', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';

      expect(buildPinoTransport()).toBeUndefined();
    });

    it('treats an empty LOKI_URL as unset', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = '  ';

      expect(buildPinoTransport()).toBeUndefined();
    });

    it('warns once on stderr when LOG_TRANSPORT=loki but LOKI_URL is empty', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';

      buildPinoTransport();

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('LOG_TRANSPORT=loki but LOKI_URL is empty'));
    });

    it('does not warn when Loki is simply not requested', () => {
      process.env.NODE_ENV = 'production';

      buildPinoTransport();

      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe('with Loki', () => {
    it('tees JSON to stdout and Loki in production, so CloudWatch keeps every line', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';

      const targets = targetsOf();

      expect(targets.map((t) => t.target)).toEqual(['pino/file', 'pino-loki']);
      expect(targets[0].options).toEqual({ destination: 1 });
    });

    it('tees pino-pretty and the local Loki in development, defaulting to localhost', () => {
      process.env.NODE_ENV = 'development';
      process.env.LOG_TRANSPORT = 'loki';

      expect(targetsOf().map((t) => t.target)).toEqual(['pino-pretty', 'pino-loki']);
      expect(lokiOptions().host).toBe('http://localhost:3100');
    });

    it('is case-insensitive on LOG_TRANSPORT', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'LOKI';
      process.env.LOKI_URL = 'https://logs.example.net';

      expect(targetsOf()).toHaveLength(2);
    });

    it('sends to LOKI_URL', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';

      expect(lokiOptions().host).toBe('https://logs.example.net');
    });

    it('labels env from ENV_TYPE, not NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENV_TYPE = 'sandbox';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';
      process.env.OTEL_SERVICE_NAME = 'app-worker';

      expect(lokiOptions().labels).toEqual({ service: 'app-worker', env: 'staging' });
    });

    it('labels the deprecated ENV_TYPE=staging as staging, the same as sandbox', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENV_TYPE = 'staging';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';

      expect(lokiOptions().labels.env).toBe('staging');
    });

    it('gives every target the root LOG_LEVEL so debug is not capped at info', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';
      process.env.LOG_LEVEL = 'DEBUG';

      expect(targetsOf().map((t) => t.level)).toEqual(['debug', 'debug']);
    });

    it('defaults every target level to info when LOG_LEVEL is unset', () => {
      process.env.NODE_ENV = 'development';
      process.env.LOG_TRANSPORT = 'loki';

      expect(targetsOf().map((t) => t.level)).toEqual(['info', 'info']);
    });

    it('falls back to app-backend and unknown labels when unset', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';

      expect(lokiOptions().labels).toEqual({ service: 'app-backend', env: 'unknown' });
    });

    it('authenticates with LOKI_USERNAME / LOKI_PASSWORD', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';
      process.env.LOKI_USERNAME = '123456';
      process.env.LOKI_PASSWORD = 'glc_token';

      expect(lokiOptions().basicAuth).toEqual({ username: '123456', password: 'glc_token' });
    });

    it('sends no basic auth unless both username and password are set', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';
      process.env.LOKI_USERNAME = '123456';

      expect(lokiOptions().basicAuth).toBeUndefined();
    });

    it('promotes nothing to a label beyond service and env (pino-loki adds level and hostname itself)', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';

      expect(lokiOptions().propsToLabels).toBeUndefined();
      expect(Object.keys(lokiOptions().labels).sort()).toEqual(['env', 'service']);
    });

    it('keeps Loki failures silent and batches every 2 seconds', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_TRANSPORT = 'loki';
      process.env.LOKI_URL = 'https://logs.example.net';

      expect(lokiOptions()).toMatchObject({ silenceErrors: true, batching: { interval: 2 } });
    });
  });
});
