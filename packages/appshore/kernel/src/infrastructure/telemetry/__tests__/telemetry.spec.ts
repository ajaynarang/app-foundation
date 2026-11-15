import { context, createContextKey, metrics, trace } from '@opentelemetry/api';
import { AggregationTemporalityPreference } from '@opentelemetry/exporter-metrics-otlp-http';

/**
 * telemetry.ts starts the SDK as an import side effect, and skips it entirely
 * under NODE_ENV=test. Each case flips NODE_ENV, loads a fresh copy of the
 * module and shuts it down again so no global OTel state leaks between tests.
 */
type TelemetryModule = typeof import('../telemetry');

const ENV_KEYS = [
  'NODE_ENV',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'LANGFUSE_SECRET_KEY',
  'ENV_TYPE',
  'OTEL_TRACES_SAMPLER_ARG',
  'OTEL_SEMCONV_STABILITY_OPT_IN',
  'ECS_CONTAINER_METADATA_URI_V4',
];

describe('telemetry bootstrap', () => {
  const originalEnv = { ...process.env };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    logSpy.mockRestore();
    warnSpy.mockRestore();
    jest.resetModules();
    jest.dontMock('@opentelemetry/sdk-node');
    jest.dontMock('@opentelemetry/auto-instrumentations-node');
    jest.dontMock('@opentelemetry/exporter-trace-otlp-http');
    jest.dontMock('@opentelemetry/exporter-metrics-otlp-http');
    context.disable();
    trace.disable();
    metrics.disable();
  });

  function loadTelemetry(): TelemetryModule {
    let loaded: TelemetryModule | undefined;
    jest.isolateModules(() => {
      // A synchronous require is the only way to re-run the module's import side effect per test.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('../telemetry');
    });
    if (!loaded) throw new Error('telemetry module did not load');
    return loaded;
  }

  describe('without an OTLP endpoint outside development', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('still registers a context manager, so Langfuse AI spans keep nesting', async () => {
      const telemetry = loadTelemetry();
      const key = createContextKey('probe');

      const seen = context.with(context.active().setValue(key, 'parent'), () => context.active().getValue(key));

      expect(seen).toBe('parent');
      await telemetry.shutdownTelemetry();
    });

    it('registers no recording tracer provider, so nothing is exported', async () => {
      const telemetry = loadTelemetry();

      const span = trace.getTracer('probe').startSpan('probe');

      expect(span.isRecording()).toBe(false);
      span.end();
      await telemetry.shutdownTelemetry();
    });

    it('logs that trace export is off', async () => {
      const telemetry = loadTelemetry();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('trace and metric export off'));
      await telemetry.shutdownTelemetry();
    });

    it('registers no meter provider, so the foundation instruments stay no-ops', async () => {
      const telemetry = loadTelemetry();

      const counter = metrics.getMeterProvider().getMeter('probe').createCounter('probe');

      expect(counter.constructor.name).toMatch(/^Noop/);
      await telemetry.shutdownTelemetry();
    });

    it('starts the SDK with no span processors, metric readers, log processors or instrumentations', () => {
      const start = jest.fn();
      const NodeSDK = jest.fn().mockImplementation(() => ({ start, shutdown: jest.fn().mockResolvedValue(undefined) }));
      jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));

      loadTelemetry();

      expect(NodeSDK).toHaveBeenCalledWith({
        spanProcessors: [],
        metricReaders: [],
        logRecordProcessors: [],
        instrumentations: [],
      });
      expect(start).toHaveBeenCalledTimes(1);
    });
  });

  describe('with an OTLP endpoint', () => {
    it('starts an exporting SDK labelled with the observability env', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENV_TYPE = 'sandbox';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp';
      const start = jest.fn();
      const NodeSDK = jest.fn().mockImplementation(() => ({ start, shutdown: jest.fn().mockResolvedValue(undefined) }));
      jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));
      jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));

      loadTelemetry();

      const config = NodeSDK.mock.calls[0][0];
      expect(config.traceExporter).toBeDefined();
      expect(config.spanProcessors).toBeUndefined();
      expect(config.resource.attributes['deployment.environment']).toBe('staging');
      expect(start).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('OpenTelemetry tracing on'));
    });

    it('samples parent-based with the OTEL_TRACES_SAMPLER_ARG ratio at the root', () => {
      process.env.NODE_ENV = 'production';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp';
      process.env.OTEL_TRACES_SAMPLER_ARG = '0.25';
      const NodeSDK = jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() }));
      jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));
      jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));

      loadTelemetry();

      const sampler = String(NodeSDK.mock.calls[0][0].sampler);
      expect(sampler).toContain('ParentBased');
      expect(sampler).toContain('TraceIdRatioBased{0.25}');
    });

    it('sends OTEL_EXPORTER_OTLP_HEADERS to the OTLP exporter at <endpoint>/v1/traces', () => {
      process.env.NODE_ENV = 'production';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp/';
      process.env.OTEL_EXPORTER_OTLP_HEADERS = 'Authorization=Basic%20abc123';
      const OTLPTraceExporter = jest.fn();
      const NodeSDK = jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() }));
      jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));
      jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));
      jest.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter }));

      loadTelemetry();

      expect(OTLPTraceExporter).toHaveBeenCalledWith({
        url: 'https://otlp.example.net/otlp/v1/traces',
        headers: { Authorization: 'Basic abc123' },
      });
      expect(NodeSDK.mock.calls[0][0].traceExporter).toBe(OTLPTraceExporter.mock.instances[0]);
    });

    it('pushes metrics to <endpoint>/v1/metrics every 60 s, cumulative, with the same auth header', async () => {
      process.env.NODE_ENV = 'production';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp';
      process.env.OTEL_EXPORTER_OTLP_HEADERS = 'Authorization=Basic%20abc123';
      const OTLPMetricExporter = jest.fn().mockImplementation(() => ({
        export: jest.fn(),
        forceFlush: jest.fn(),
        shutdown: jest.fn(),
      }));
      const NodeSDK = jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() }));
      jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));
      jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));
      jest.doMock('@opentelemetry/exporter-metrics-otlp-http', () => ({
        ...jest.requireActual('@opentelemetry/exporter-metrics-otlp-http'),
        OTLPMetricExporter,
      }));

      loadTelemetry();

      expect(OTLPMetricExporter).toHaveBeenCalledWith({
        url: 'https://otlp.example.net/otlp/v1/metrics',
        headers: { Authorization: 'Basic abc123' },
        temporalityPreference: AggregationTemporalityPreference.CUMULATIVE,
      });
      const config = NodeSDK.mock.calls[0][0];
      expect(config.metricReaders).toHaveLength(1);
      expect(config.metricReaders[0]._exportInterval).toBe(60_000);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('metrics every 60s'));

      // The views really drop the unused auto-instrumented histograms and leave the rest alone.
      const { MeterProvider, InMemoryMetricExporter, PeriodicExportingMetricReader } =
        jest.requireActual<typeof import('@opentelemetry/sdk-metrics')>('@opentelemetry/sdk-metrics');
      const exporter = new InMemoryMetricExporter(AggregationTemporalityPreference.CUMULATIVE as never);
      const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
      const provider = new MeterProvider({ views: config.views, readers: [reader] });
      const meter = provider.getMeter('test');
      meter.createHistogram('http.client.request.duration').record(0.1);
      meter.createHistogram('db.client.operation.duration').record(0.1);
      meter.createHistogram('v8js.gc.duration').record(0.1);
      meter.createHistogram('http.server.request.duration').record(0.1);
      const { resourceMetrics } = await reader.collect();
      const names = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics.map((m) => m.descriptor.name));
      expect(names).toEqual(['http.server.request.duration']);
    });

    it('stamps a stable service.instance.id (the ECS task id) and stops the default OTLP log export', () => {
      process.env.NODE_ENV = 'production';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp';
      process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://169.254.170.2/v4/0123456789abcdef0123456789abcdef-1234567890';
      const NodeSDK = jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() }));
      jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));
      jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));

      loadTelemetry();

      const config = NodeSDK.mock.calls[0][0];
      expect(config.resource.attributes['service.instance.id']).toBe('0123456789abcdef0123456789abcdef');
      expect(config.logRecordProcessors).toEqual([]);
    });

    it('opts into the stable HTTP semconv the SLO rules read, unless set explicitly', () => {
      process.env.NODE_ENV = 'production';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otlp.example.net/otlp';
      const NodeSDK = jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() }));
      jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));
      jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));

      loadTelemetry();
      expect(process.env.OTEL_SEMCONV_STABILITY_OPT_IN).toBe('http');

      jest.resetModules();
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup';
      loadTelemetry();
      expect(process.env.OTEL_SEMCONV_STABILITY_OPT_IN).toBe('http/dup');
    });
  });

  it('exports to the local collector on a developer machine (ENV_TYPE=development) with no endpoint set', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENV_TYPE = 'development';
    const OTLPTraceExporter = jest.fn();
    const NodeSDK = jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() }));
    jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));
    jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));
    jest.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter }));

    loadTelemetry();

    expect(OTLPTraceExporter).toHaveBeenCalledWith({ url: 'http://localhost:4318/v1/traces', headers: {} });
  });

  it('builds the Langfuse provider with the PII-masking processor when Langfuse is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
    const BasicTracerProvider = jest.fn().mockImplementation(() => ({ shutdown: jest.fn() }));
    jest.doMock('@opentelemetry/sdk-trace-base', () => ({
      ...jest.requireActual('@opentelemetry/sdk-trace-base'),
      BasicTracerProvider,
    }));
    jest.doMock('@langfuse/tracing', () => ({ setLangfuseTracerProvider: jest.fn(), getLangfuseTracer: jest.fn() }));
    jest.doMock('@opentelemetry/sdk-node', () => ({
      ...jest.requireActual('@opentelemetry/sdk-node'),
      NodeSDK: jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() })),
    }));

    loadTelemetry();

    const { PiiMaskingLangfuseSpanProcessor } = jest.requireActual<
      typeof import('../pii-masking-langfuse-span-processor')
    >('../pii-masking-langfuse-span-processor');
    const [processor] = BasicTracerProvider.mock.calls[0][0].spanProcessors;
    expect(processor.constructor.name).toBe(PiiMaskingLangfuseSpanProcessor.name);
    jest.dontMock('@opentelemetry/sdk-trace-base');
    jest.dontMock('@langfuse/tracing');
  });

  it('does nothing under NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    const NodeSDK = jest.fn();
    jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));

    loadTelemetry();

    expect(NodeSDK).not.toHaveBeenCalled();
  });

  it('keeps the process up when the SDK throws on start', () => {
    process.env.NODE_ENV = 'production';
    const NodeSDK = jest.fn().mockImplementation(() => ({
      start: () => {
        throw new Error('boom');
      },
    }));
    jest.doMock('@opentelemetry/sdk-node', () => ({ ...jest.requireActual('@opentelemetry/sdk-node'), NodeSDK }));

    expect(() => loadTelemetry()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to initialize'), expect.any(Error));
  });
});
