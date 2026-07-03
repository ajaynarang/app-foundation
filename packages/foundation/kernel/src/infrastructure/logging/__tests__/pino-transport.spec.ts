import { buildPinoTransport } from '../pino-transport';

describe('buildPinoTransport', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns undefined in production when LOG_TRANSPORT is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_TRANSPORT;

    expect(buildPinoTransport()).toBeUndefined();
  });

  it('returns pino-pretty in development when LOG_TRANSPORT is unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_TRANSPORT;

    const transport = buildPinoTransport();

    expect(transport).toMatchObject({ target: 'pino-pretty' });
  });

  it('returns pretty + loki targets in development when LOG_TRANSPORT=loki', () => {
    process.env.NODE_ENV = 'development';
    process.env.LOG_TRANSPORT = 'loki';
    process.env.LOKI_URL = 'http://localhost:3100';

    const transport = buildPinoTransport() as unknown as {
      targets: Array<{ target: string }>;
    };

    expect(transport.targets).toHaveLength(2);
    expect(transport.targets.map((t) => t.target)).toEqual(['pino-pretty', 'pino-loki']);
  });

  it('returns loki target only in production when LOG_TRANSPORT=loki', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_TRANSPORT = 'loki';

    const transport = buildPinoTransport() as unknown as {
      targets: Array<{ target: string }>;
    };

    expect(transport.targets).toHaveLength(1);
    expect(transport.targets[0].target).toBe('pino-loki');
  });

  it('reads LOKI_URL from env', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_TRANSPORT = 'loki';
    process.env.LOKI_URL = 'http://loki:3100';

    const transport = buildPinoTransport() as unknown as {
      targets: Array<{ options: { host: string } }>;
    };

    expect(transport.targets[0].options.host).toBe('http://loki:3100');
  });

  it('falls back to default loki host when LOKI_URL is unset', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_TRANSPORT = 'loki';
    delete process.env.LOKI_URL;

    const transport = buildPinoTransport() as unknown as {
      targets: Array<{ options: { host: string } }>;
    };

    expect(transport.targets[0].options.host).toBe('http://localhost:3100');
  });

  it('labels the loki stream with the service name from OTEL_SERVICE_NAME', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_TRANSPORT = 'loki';
    process.env.OTEL_SERVICE_NAME = 'custom-svc';

    const transport = buildPinoTransport() as unknown as {
      targets: Array<{ options: { labels: Record<string, string> } }>;
    };

    expect(transport.targets[0].options.labels.service).toBe('custom-svc');
  });

  it('is case-insensitive on LOG_TRANSPORT', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_TRANSPORT = 'LOKI';

    const transport = buildPinoTransport() as unknown as { targets: unknown[] };

    expect(transport.targets).toHaveLength(1);
  });
});
