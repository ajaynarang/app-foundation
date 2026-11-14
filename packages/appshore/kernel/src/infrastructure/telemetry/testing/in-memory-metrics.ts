import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
  type MetricData,
} from '@opentelemetry/sdk-metrics';

/**
 * Test helper: a real OTel MeterProvider registered globally and read on demand. The instruments in `metrics.ts`
 * resolve against the global provider, so this exercises the same path as production; only the exporter is swapped
 * for memory. Used by kernel and platform specs; nothing at runtime imports it.
 */
export class InMemoryMetrics {
  private readonly exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  private readonly reader = new PeriodicExportingMetricReader({
    exporter: this.exporter,
    // Collection is driven by collect(); the timer never fires in a test.
    exportIntervalMillis: 3_600_000,
  });
  private readonly provider = new MeterProvider({ readers: [this.reader] });

  static install(): InMemoryMetrics {
    metrics.disable();
    const harness = new InMemoryMetrics();
    metrics.setGlobalMeterProvider(harness.provider);
    return harness;
  }

  async uninstall(): Promise<void> {
    await this.provider.shutdown();
    metrics.disable();
  }

  /** Every metric collected right now (observable callbacks run here). */
  async collect(): Promise<MetricData[]> {
    const { resourceMetrics } = await this.reader.collect();
    return resourceMetrics.scopeMetrics.flatMap((scope) => scope.metrics);
  }

  async metric(name: string): Promise<MetricData | undefined> {
    return (await this.collect()).find((m) => m.descriptor.name === name);
  }

  async points(name: string): Promise<DataPoint<unknown>[]> {
    return ((await this.metric(name))?.dataPoints ?? []) as DataPoint<unknown>[];
  }
}
