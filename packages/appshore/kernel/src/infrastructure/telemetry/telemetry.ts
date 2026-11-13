import { NodeSDK, resources, tracing } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AggregationTemporalityPreference, OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { AggregationType, PeriodicExportingMetricReader, type ViewOptions } from '@opentelemetry/sdk-metrics';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { setLangfuseTracerProvider, getLangfuseTracer } from '@langfuse/tracing';
import type { Tracer } from '@opentelemetry/api';
import { hostname } from 'node:os';
import { PiiMaskingLangfuseSpanProcessor } from './pii-masking-langfuse-span-processor';
import {
  resolveMetricExportConfig,
  resolveServiceInstanceId,
  resolveTraceExportConfig,
  type MetricExportConfig,
  type TraceExportConfig,
} from './telemetry-config';
import { EnvLabelMetricExporter } from './env-label-metric-exporter';

let sdk: NodeSDK | null = null;
let langfuseTracerProvider: BasicTracerProvider | null = null;

// Isolated Langfuse tracing pipeline, kept SEPARATE from the global NodeSDK below (which exports HTTP, pg and Redis
// spans over OTLP). We do NOT add the Langfuse processor to the global SDK: that would flood Langfuse with non-LLM
// spans and rack up ingestion cost. Instead a dedicated TracerProvider's tracer is passed explicitly to each AI SDK
// call via `experimental_telemetry.tracer`, so ONLY model calls reach Langfuse. Mastra agents have their own
// LangfuseExporter (mastra.provider.ts) and don't use this tracer. Gated on LANGFUSE_SECRET_KEY: when unset, AI calls
// fall back to the default (global) tracer and Langfuse export is off. The processor masks phones and emails in
// every string attribute before a span is exported (docs/standards/observability.md, rule 12).
if (process.env.NODE_ENV !== 'test' && process.env.LANGFUSE_SECRET_KEY) {
  try {
    // BasicTracerProvider (sdk-trace-base 2.x) matches @langfuse/otel's peer range. NodeTracerProvider's
    // context-manager and propagator registration is not needed: the global NodeSDK owns context; this provider only
    // exports AI spans to Langfuse.
    langfuseTracerProvider = new BasicTracerProvider({
      spanProcessors: [new PiiMaskingLangfuseSpanProcessor()],
    });
    setLangfuseTracerProvider(langfuseTracerProvider);
    console.log('[telemetry] Langfuse AI tracing enabled (isolated provider, phones and emails masked)');
  } catch (err) {
    console.warn('[telemetry] Langfuse tracer failed to initialize; AI calls will not export to Langfuse:', err);
    langfuseTracerProvider = null;
  }
}

/**
 * The isolated Langfuse tracer for AI SDK calls. Pass into `generateText`/`embed`'s `experimental_telemetry.tracer`.
 * Returns undefined when Langfuse isn't configured, so callers leave telemetry on the default tracer without erroring.
 */
export function getAiLangfuseTracer(): Tracer | undefined {
  if (!langfuseTracerProvider) return undefined;
  return getLangfuseTracer();
}

/**
 * One OTLP metric reader on the same endpoint and auth header as traces, pushing every 60 s with cumulative
 * temporality (what a Prometheus-compatible OTLP ingest expects). Push, not a `/metrics` scrape: the worker has no
 * HTTP port.
 */
function buildMetricReader(metricExport: MetricExportConfig): PeriodicExportingMetricReader {
  const otlp = new OTLPMetricExporter({
    url: metricExport.url,
    headers: metricExport.headers,
    temporalityPreference: AggregationTemporalityPreference.CUMULATIVE,
  });
  return new PeriodicExportingMetricReader({
    exporter: new EnvLabelMetricExporter(otlp, metricExport.envLabel),
    exportIntervalMillis: metricExport.exportIntervalMillis,
  });
}

/**
 * The HTTP instrumentation emits the stable `http.server.request.duration` histogram (in seconds, which the SLO
 * rules read) only under this opt-in; without it, it emits the old `http.server.duration` in milliseconds. It is read
 * when the instrumentation is constructed, so it is set before that. An explicit value wins.
 */
function optIntoStableHttpSemconv(): void {
  if (!process.env.OTEL_SEMCONV_STABILITY_OPT_IN?.trim()) process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http';
}

/**
 * Auto-instrumented histograms no rule or dashboard reads. Each one is about 15 buckets times every label
 * combination, so together they are most of a small stack's active series. Spans still carry the same timings;
 * re-enable one here if a board ever needs it.
 */
export const DROPPED_INSTRUMENTS = [
  'http.client.request.duration',
  'db.client.operation.duration',
  'v8js.gc.duration',
] as const;

const DROP_UNUSED_VIEWS: ViewOptions[] = DROPPED_INSTRUMENTS.map((instrumentName) => ({
  instrumentName,
  aggregation: { type: AggregationType.DROP },
}));

function buildExportingSdk(traceExport: TraceExportConfig, metricExport: MetricExportConfig | null): NodeSDK {
  optIntoStableHttpSemconv();
  return new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME?.trim() || 'app-backend',
    resource: resources.resourceFromAttributes({
      'deployment.environment': traceExport.deploymentEnvironment,
      'deployment.environment.name': traceExport.deploymentEnvironment,
      // One per ECS task: two tasks of the same service export the same counters, and without a distinct instance
      // their cumulative series would overwrite each other. Stable across a restart so a restart does not mint an
      // unrelated series set.
      'service.instance.id': resolveServiceInstanceId(process.env, hostname()),
    }),
    traceExporter: new OTLPTraceExporter({ url: traceExport.url, headers: traceExport.headers }),
    metricReaders: metricExport ? [buildMetricReader(metricExport)] : [],
    views: DROP_UNUSED_VIEWS,
    // Logs reach Loki through pino (pino-transport.ts). An empty list stops NodeSDK defaulting to an OTLP log
    // exporter, which would ship every line a second time through the pino instrumentation and double-count the
    // log-based alert rules.
    logRecordProcessors: [],
    // Parent-based: a request that arrives already sampled (or not) keeps that decision, so a trace is never
    // half-recorded across services.
    sampler: new tracing.ParentBasedSampler({
      root: new tracing.TraceIdRatioBasedSampler(traceExport.sampleRatio),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });
}

/**
 * No endpoint: the SDK still starts so the global context manager and propagator exist; the isolated Langfuse
 * provider above relies on them for AI spans to nest. The three empty lists are what stop NodeSDK falling back to its
 * default OTLP exporters (localhost) for spans, metrics and logs. With no span processors it registers no tracer
 * provider, and with no metric readers no meter provider, so every instrument in metrics.ts stays a no-op. No
 * instrumentations: their spans would have nowhere to go.
 */
function buildContextOnlySdk(): NodeSDK {
  return new NodeSDK({ spanProcessors: [], metricReaders: [], logRecordProcessors: [], instrumentations: [] });
}

if (process.env.NODE_ENV !== 'test') {
  const traceExport = resolveTraceExportConfig();
  const metricExport = resolveMetricExportConfig();
  try {
    sdk = traceExport ? buildExportingSdk(traceExport, metricExport) : buildContextOnlySdk();
    sdk.start();
    // Prisma queries appear as `pg` spans (driver adapter); BullMQ has no instrumentation, so jobs show up only
    // through their Redis, pg and http calls.
    console.log(
      traceExport
        ? `[telemetry] OpenTelemetry tracing on (http, express, nestjs, pg, ioredis; sample ratio ${traceExport.sampleRatio}); metrics ${metricExport ? `every ${metricExport.exportIntervalMillis / 1000}s` : 'off'}`
        : '[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set; trace and metric export off (context propagation only)',
    );
  } catch (err) {
    console.warn('[telemetry] OpenTelemetry SDK failed to initialize; continuing without tracing:', err);
    sdk = null;
  }
}

/**
 * Flush pending spans and metrics and shut down the OTel SDK. Called by the NestJS shutdown hook AFTER the app has
 * stopped accepting new requests, so no new spans are generated after this point.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown().catch((err) => console.warn('[telemetry] SDK shutdown error:', err));
  }
  if (langfuseTracerProvider) {
    await langfuseTracerProvider
      .shutdown()
      .catch((err) => console.warn('[telemetry] Langfuse provider shutdown error:', err));
  }
}
