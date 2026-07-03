import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { setLangfuseTracerProvider, getLangfuseTracer } from '@langfuse/tracing';
import type { Tracer } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;
let langfuseTracerProvider: BasicTracerProvider | null = null;

// Isolated Langfuse tracing pipeline, kept SEPARATE from the global NodeSDK
// above (which exports everything — HTTP/Prisma/Redis/BullMQ — to Tempo via
// OTLP). We do NOT add LangfuseSpanProcessor to the global SDK: that would
// flood Langfuse with non-LLM spans and rack up ingestion cost. Instead we
// build a dedicated TracerProvider whose tracer is passed explicitly to each
// AI SDK call via `experimental_telemetry.tracer`, so ONLY model calls reach
// Langfuse. Mastra agents have their own LangfuseExporter (mastra.provider.ts)
// and don't use this tracer. Gated on LANGFUSE_SECRET_KEY — when unset, AI
// calls fall back to the default (global) tracer and Langfuse export is off.
if (process.env.NODE_ENV !== 'test' && process.env.LANGFUSE_SECRET_KEY) {
  try {
    // BasicTracerProvider (sdk-trace-base 2.x) matches @langfuse/otel's peer
    // range. We don't need NodeTracerProvider's default context-manager /
    // propagator registration here — the global NodeSDK already owns context;
    // this provider exists only to export AI spans to Langfuse.
    langfuseTracerProvider = new BasicTracerProvider({
      spanProcessors: [new LangfuseSpanProcessor()],
    });
    setLangfuseTracerProvider(langfuseTracerProvider);
    console.log('[telemetry] Langfuse AI tracing enabled (isolated provider)');
  } catch (err) {
    console.warn('[telemetry] Langfuse tracer failed to initialize; AI calls will not export to Langfuse:', err);
    langfuseTracerProvider = null;
  }
}

/**
 * The isolated Langfuse tracer for AI SDK calls. Pass into
 * `generateText`/`embed`'s `experimental_telemetry.tracer`. Returns undefined
 * when Langfuse isn't configured, so callers leave telemetry on the default
 * tracer (Tempo) without erroring.
 */
export function getAiLangfuseTracer(): Tracer | undefined {
  if (!langfuseTracerProvider) return undefined;
  return getLangfuseTracer();
}

if (process.env.NODE_ENV !== 'test') {
  // Treat empty string the same as unset — Doppler/ECS env vars can surface
  // as "" and `??` would otherwise concatenate with `/v1/traces` and produce
  // the invalid URL `"/v1/traces"`, which OTel v0.212+ rejects and crashes
  // the process at construction time.
  const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || 'http://localhost:4318';

  try {
    sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'app-backend',
      traceExporter: new OTLPTraceExporter({
        url: `${otlpBase}/v1/traces`,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });
    sdk.start();
    console.log('[telemetry] OpenTelemetry SDK started (HTTP + Prisma + Redis + BullMQ)');
  } catch (err) {
    console.warn('[telemetry] OpenTelemetry SDK failed to initialize; continuing without tracing:', err);
    sdk = null;
  }
}

/**
 * Flush pending spans and shut down the OTel SDK.
 * Called by the NestJS shutdown hook in main.ts AFTER the app has stopped
 * accepting new requests, so no new spans are generated after this point.
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
