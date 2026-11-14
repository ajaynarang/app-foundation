import {
  DEV_PROMETHEUS_OTLP_METRICS_URL,
  METRIC_EXPORT_INTERVAL_MS,
  parseOtlpHeaders,
  resolveMetricExportConfig,
  resolveSampleRatio,
  resolveServiceInstanceId,
  resolveTraceExportConfig,
} from '../telemetry-config';

describe('resolveServiceInstanceId', () => {
  it('uses the ECS task id from the Fargate metadata URI', () => {
    const env = {
      ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/0123456789abcdef0123456789abcdef-1234567890',
    };

    expect(resolveServiceInstanceId(env, 'ip-10-0-1-5')).toBe('0123456789abcdef0123456789abcdef');
  });

  it('falls back to the hostname off ECS or when the URI has no task id', () => {
    expect(resolveServiceInstanceId({}, 'dev-laptop')).toBe('dev-laptop');
    expect(
      resolveServiceInstanceId({ ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/abc' }, 'ip-10-0-1-5'),
    ).toBe('ip-10-0-1-5');
  });

  it('is stable across calls (a restart keeps the same identity)', () => {
    const env = { ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/0123456789abcdef0123456789abcdef-1' };

    expect(resolveServiceInstanceId(env, 'h')).toBe(resolveServiceInstanceId(env, 'h'));
  });
});

describe('resolveTraceExportConfig', () => {
  it('turns trace export off outside development when the endpoint is unset', () => {
    expect(resolveTraceExportConfig({ NODE_ENV: 'production', ENV_TYPE: 'production' })).toBeNull();
    expect(resolveTraceExportConfig({ NODE_ENV: 'production', ENV_TYPE: 'sandbox' })).toBeNull();
  });

  it('never falls back to localhost on NODE_ENV alone: the environment comes from ENV_TYPE', () => {
    expect(resolveTraceExportConfig({ NODE_ENV: 'development' })).toBeNull();
    expect(resolveTraceExportConfig({ NODE_ENV: 'development', ENV_TYPE: 'preprod' })).toBeNull();
  });

  it('treats an empty endpoint as unset (Doppler and ECS surface cleared keys as "")', () => {
    expect(resolveTraceExportConfig({ ENV_TYPE: 'production', OTEL_EXPORTER_OTLP_ENDPOINT: '  ' })).toBeNull();
  });

  it('falls back to the local collector only with ENV_TYPE=development', () => {
    const config = resolveTraceExportConfig({ ENV_TYPE: 'development' });

    expect(config?.url).toBe('http://localhost:4318/v1/traces');
    expect(config?.deploymentEnvironment).toBe('development');
  });

  it('exports to the configured endpoint, appending the traces path once', () => {
    const config = resolveTraceExportConfig({
      ENV_TYPE: 'production',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.net/otlp/',
    });

    expect(config?.url).toBe('https://otlp.example.net/otlp/v1/traces');
  });

  it('carries the OTLP auth header from OTEL_EXPORTER_OTLP_HEADERS', () => {
    const config = resolveTraceExportConfig({
      ENV_TYPE: 'production',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.net/otlp',
      OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20dXNlcjpwYXNz',
    });

    expect(config?.headers).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
  });

  it.each([
    ['Sandbox', 'staging'],
    ['preprod', 'staging'],
    ['staging', 'staging'],
    ['production', 'production'],
  ])('labels ENV_TYPE=%s as deployment environment %s, never from NODE_ENV', (envType, label) => {
    const config = resolveTraceExportConfig({
      NODE_ENV: 'production',
      ENV_TYPE: envType,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.net/otlp',
    });

    expect(config?.deploymentEnvironment).toBe(label);
  });

  it('labels the deployment environment unknown when ENV_TYPE is unset', () => {
    expect(
      resolveTraceExportConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.net/otlp' })?.deploymentEnvironment,
    ).toBe('unknown');
  });

  it('samples everything by default', () => {
    expect(resolveTraceExportConfig({ ENV_TYPE: 'development' })?.sampleRatio).toBe(1);
  });
});

describe('parseOtlpHeaders', () => {
  it('parses several comma-separated pairs', () => {
    expect(parseOtlpHeaders('a=1, b=two')).toEqual({ a: '1', b: 'two' });
  });

  it('keeps "=" inside a value (base64 padding)', () => {
    expect(parseOtlpHeaders('Authorization=Basic abc==')).toEqual({ Authorization: 'Basic abc==' });
  });

  it('skips malformed pairs and returns {} for unset input', () => {
    expect(parseOtlpHeaders('novalue,=x,ok=1')).toEqual({ ok: '1' });
    expect(parseOtlpHeaders(undefined)).toEqual({});
  });

  it('keeps a value that is not valid URL encoding as-is', () => {
    expect(parseOtlpHeaders('k=100%')).toEqual({ k: '100%' });
  });
});

describe('resolveSampleRatio', () => {
  it('reads a ratio between 0 and 1', () => {
    expect(resolveSampleRatio('0.25')).toBe(0.25);
    expect(resolveSampleRatio('0')).toBe(0);
  });

  it('falls back to 1 for missing, non-numeric or out-of-range values', () => {
    expect(resolveSampleRatio(undefined)).toBe(1);
    expect(resolveSampleRatio('')).toBe(1);
    expect(resolveSampleRatio('half')).toBe(1);
    expect(resolveSampleRatio('1.5')).toBe(1);
    expect(resolveSampleRatio('-0.1')).toBe(1);
  });
});

describe('resolveMetricExportConfig', () => {
  it('sends development metrics to the local Prometheus OTLP receiver when no endpoint is set (Tempo takes no metrics)', () => {
    expect(resolveMetricExportConfig({ ENV_TYPE: 'development' })?.url).toBe(
      'http://localhost:9090/api/v1/otlp/v1/metrics',
    );
    expect(DEV_PROMETHEUS_OTLP_METRICS_URL).toBe('http://localhost:9090/api/v1/otlp/v1/metrics');
  });

  it('keeps <endpoint>/v1/metrics in development when the endpoint is set, and the override wins over both', () => {
    expect(
      resolveMetricExportConfig({ ENV_TYPE: 'development', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' })?.url,
    ).toBe('http://collector:4318/v1/metrics');
    expect(
      resolveMetricExportConfig({
        ENV_TYPE: 'development',
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://localhost:9999/v1/metrics',
      })?.url,
    ).toBe('http://localhost:9999/v1/metrics');
  });

  it('is off whenever traces are off (one endpoint switches both)', () => {
    expect(resolveMetricExportConfig({ ENV_TYPE: 'production', OTEL_EXPORTER_OTLP_ENDPOINT: '' })).toBeNull();
  });

  it('is not turned on by the metrics override alone', () => {
    expect(
      resolveMetricExportConfig({
        ENV_TYPE: 'production',
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://localhost:9090/api/v1/otlp/v1/metrics',
      }),
    ).toBeNull();
  });

  it('exports to <endpoint>/v1/metrics with the shared auth header every 60 s', () => {
    expect(
      resolveMetricExportConfig({
        ENV_TYPE: 'production',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.net/otlp//',
        OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20dXNlcjpwYXNz',
      }),
    ).toEqual({
      url: 'https://otlp.example.net/otlp/v1/metrics',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
      envLabel: 'production',
    });
    expect(METRIC_EXPORT_INTERVAL_MS).toBe(60_000);
  });

  it('honours OTEL_EXPORTER_OTLP_METRICS_ENDPOINT as the full metrics URL (local Prometheus)', () => {
    const config = resolveMetricExportConfig({
      ENV_TYPE: 'development',
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: ' http://localhost:9090/api/v1/otlp/v1/metrics ',
    });

    expect(config?.url).toBe('http://localhost:9090/api/v1/otlp/v1/metrics');
    expect(resolveTraceExportConfig({ ENV_TYPE: 'development' })?.url).toBe('http://localhost:4318/v1/traces');
  });

  it('labels env from ENV_TYPE (sandbox -> staging), never NODE_ENV', () => {
    const config = resolveMetricExportConfig({
      NODE_ENV: 'production',
      ENV_TYPE: 'sandbox',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.net/otlp',
    });

    expect(config?.envLabel).toBe('staging');
  });
});
