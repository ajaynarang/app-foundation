import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  InstrumentType,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { EnvLabelMetricExporter } from '../env-label-metric-exporter';

describe('EnvLabelMetricExporter', () => {
  let inner: InMemoryMetricExporter;
  let provider: MeterProvider;
  let reader: PeriodicExportingMetricReader;

  beforeEach(() => {
    inner = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    reader = new PeriodicExportingMetricReader({
      exporter: new EnvLabelMetricExporter(inner, 'staging'),
      exportIntervalMillis: 3_600_000,
    });
    provider = new MeterProvider({ readers: [reader] });
  });

  afterEach(async () => {
    await provider.shutdown();
    metrics.disable();
  });

  function exportedPoints() {
    return inner
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .flatMap((metric) => metric.dataPoints.map((point) => ({ name: metric.descriptor.name, point })));
  }

  it('stamps env on every data point and keeps the existing labels', async () => {
    const meter = provider.getMeter('test');
    meter.createCounter('app_job_failed').add(1, { queue: 'events' });
    meter.createHistogram('http.server.request.duration').record(0.2, { 'http.route': '/items' });

    await reader.forceFlush();

    const points = exportedPoints();
    expect(points).toHaveLength(2);
    expect(points.find((p) => p.name === 'app_job_failed')?.point.attributes).toEqual({
      queue: 'events',
      env: 'staging',
    });
    expect(points.find((p) => p.name === 'http.server.request.duration')?.point.attributes).toEqual({
      'http.route': '/items',
      env: 'staging',
    });
  });

  it('overrides an env attribute set by instrumented code', async () => {
    provider.getMeter('test').createCounter('x').add(1, { env: 'production' });

    await reader.forceFlush();

    expect(exportedPoints()[0].point.attributes.env).toBe('staging');
  });

  it('reports the inner exporter result and keeps its cumulative temporality', async () => {
    const wrapped = new EnvLabelMetricExporter(inner, 'production');
    const callback = jest.fn();

    wrapped.export({ resource: {} as never, scopeMetrics: [] }, callback);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // ExportResultCode.SUCCESS is 0 (@opentelemetry/core, not a kernel dependency).
    expect(callback).toHaveBeenCalledWith({ code: 0 });
    expect(wrapped.selectAggregationTemporality?.(InstrumentType.COUNTER)).toBe(AggregationTemporality.CUMULATIVE);
  });

  it('leaves the optional selectors undefined when the inner exporter has none', () => {
    const bare = { export: jest.fn(), forceFlush: jest.fn(), shutdown: jest.fn() };

    const wrapped = new EnvLabelMetricExporter(bare, 'production');

    expect(wrapped.selectAggregationTemporality).toBeUndefined();
    expect(wrapped.selectAggregation).toBeUndefined();
  });

  it('delegates flush and shutdown', async () => {
    const bare = {
      export: jest.fn(),
      forceFlush: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
    };
    const wrapped = new EnvLabelMetricExporter(bare, 'production');

    await wrapped.forceFlush();
    await wrapped.shutdown();

    expect(bare.forceFlush).toHaveBeenCalledTimes(1);
    expect(bare.shutdown).toHaveBeenCalledTimes(1);
  });
});
