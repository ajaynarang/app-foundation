import type {
  AggregationOption,
  AggregationTemporality,
  InstrumentType,
  MetricData,
  PushMetricExporter,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';

export const ENV_METRIC_LABEL = 'env';

type ExportCallback = Parameters<PushMetricExporter['export']>[1];

/**
 * Stamps `env` (the ENV_TYPE observability label, never NODE_ENV) on every data point before it leaves the process,
 * then delegates to the real OTLP exporter. A metrics backend turns resource attributes into `target_info`, not
 * series labels, and every rule and board filters on `env="…"`, so the label has to ride on the points themselves.
 * Doing it here covers the auto-instrumented HTTP histograms too, which foundation code never touches.
 */
export class EnvLabelMetricExporter implements PushMetricExporter {
  // Mirrored from the inner exporter (cumulative temporality, default aggregation), and left undefined when it has
  // none, so the reader keeps its own defaults exactly as it would without the wrapper.
  readonly selectAggregationTemporality?: (instrumentType: InstrumentType) => AggregationTemporality;
  readonly selectAggregation?: (instrumentType: InstrumentType) => AggregationOption;

  constructor(
    private readonly inner: PushMetricExporter,
    private readonly envLabel: string,
  ) {
    this.selectAggregationTemporality = inner.selectAggregationTemporality?.bind(inner);
    this.selectAggregation = inner.selectAggregation?.bind(inner);
  }

  export(metrics: ResourceMetrics, resultCallback: ExportCallback): void {
    this.inner.export(withEnvLabel(metrics, this.envLabel), resultCallback);
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}

export function withEnvLabel(metrics: ResourceMetrics, envLabel: string): ResourceMetrics {
  return {
    ...metrics,
    scopeMetrics: metrics.scopeMetrics.map((scope) => ({
      ...scope,
      metrics: scope.metrics.map((metric) => labelMetric(metric, envLabel)),
    })),
  };
}

function labelMetric(metric: MetricData, envLabel: string): MetricData {
  // The union of point types means TS cannot prove the spread keeps the same variant; it does, only `attributes`
  // changes.
  const dataPoints = metric.dataPoints.map((point) => ({
    ...point,
    attributes: { ...point.attributes, [ENV_METRIC_LABEL]: envLabel },
  }));
  return { ...metric, dataPoints } as MetricData;
}
