/**
 * Pure env → config resolution for the OpenTelemetry pipeline. Kept out of telemetry.ts, which starts the SDK as an
 * import side effect, so it can be unit-tested. Dependency-free apart from env-label (which imports nothing): it runs
 * before Nest boots and before the SDK patches anything.
 */
import { isDevelopmentEnv, resolveObservabilityEnv } from '../../shared/utils/env-label';

/** The local collector (Tempo, or anything speaking OTLP over HTTP) a developer's machine falls back to. */
export const DEV_OTLP_BASE = 'http://localhost:4318';
/**
 * Where development metrics go when no endpoint is set: the local Prometheus OTLP receiver (the `observability`
 * compose profile). Tempo on :4318 takes traces only, so `${DEV_OTLP_BASE}/v1/metrics` would fail every export.
 */
export const DEV_PROMETHEUS_OTLP_METRICS_URL = 'http://localhost:9090/api/v1/otlp/v1/metrics';
const DEFAULT_SAMPLE_RATIO = 1;

export interface TraceExportConfig {
  url: string;
  headers: Record<string, string>;
  sampleRatio: number;
  deploymentEnvironment: string;
}

/**
 * Null when traces must not be exported. Outside `ENV_TYPE=development` an empty `OTEL_EXPORTER_OTLP_ENDPOINT`
 * means "off": there is no collector on localhost in ECS, and exporting into the void only burns CPU and logs
 * connection errors. Empty strings count as unset: Doppler and ECS can surface a cleared key as "".
 */
export function resolveTraceExportConfig(env: NodeJS.ProcessEnv = process.env): TraceExportConfig | null {
  const base = resolveOtlpBase(env);
  if (!base) return null;

  return {
    url: `${base}/v1/traces`,
    headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    sampleRatio: resolveSampleRatio(env.OTEL_TRACES_SAMPLER_ARG),
    deploymentEnvironment: resolveObservabilityEnv(env.ENV_TYPE),
  };
}

export interface MetricExportConfig {
  url: string;
  headers: Record<string, string>;
  exportIntervalMillis: number;
  /** The `env` label stamped on every data point (the alert rules filter on it). */
  envLabel: string;
}

/** Metrics leave the process once a minute; every alert rule uses a window of five minutes or more. */
export const METRIC_EXPORT_INTERVAL_MS = 60_000;

/**
 * Null when metrics must not be exported. They share `OTEL_EXPORTER_OTLP_ENDPOINT` and its auth header with traces,
 * so one key turns both on and an empty one turns both off. The standard `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`
 * overrides the metrics URL only (a full URL, used as given), so on a laptop metrics can go to Prometheus while
 * traces go to Tempo. The override never turns metrics on by itself: with traces off, metrics are off too. On the
 * development fallback (no endpoint set) metrics default to the local Prometheus receiver, not Tempo.
 */
export function resolveMetricExportConfig(env: NodeJS.ProcessEnv = process.env): MetricExportConfig | null {
  const base = resolveOtlpBase(env);
  if (!base) return null;
  const override = env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim();
  const devFallback = !env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return {
    url: override || (devFallback ? DEV_PROMETHEUS_OTLP_METRICS_URL : `${base}/v1/metrics`),
    headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
    envLabel: resolveObservabilityEnv(env.ENV_TYPE),
  };
}

/** Fargate's metadata URI ends in `/v4/<32-hex task id>-<suffix>`. */
const ECS_TASK_ID_PATTERN = /\/v4\/([0-9a-f]{32})(?:-|$)/;

/**
 * A stable `service.instance.id`: the ECS task id when the metadata URI carries one, else the hostname (one per task
 * on awsvpc, one per machine locally). Never a fresh UUID: that would mint a new series set for every counter and
 * histogram on each process start. The API and the worker differ by `service.name`, so they never collide.
 */
export function resolveServiceInstanceId(env: NodeJS.ProcessEnv, hostname: string): string {
  const taskId = env.ECS_CONTAINER_METADATA_URI_V4?.match(ECS_TASK_ID_PATTERN)?.[1];
  return taskId ?? hostname;
}

/** The OTLP base URL without a trailing slash, or undefined when export is off. */
function resolveOtlpBase(env: NodeJS.ProcessEnv): string | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const base = endpoint || (isDevelopmentEnv(env.ENV_TYPE) ? DEV_OTLP_BASE : undefined);
  return base?.replace(/\/+$/, '');
}

/**
 * The OTel spec format: `key1=value1,key2=value2`, values URL-encoded. Grafana Cloud's is
 * `Authorization=Basic%20<base64>`.
 */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of (raw ?? '').split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = safeDecode(pair.slice(0, eq).trim());
    const value = safeDecode(pair.slice(eq + 1).trim());
    if (key && value) headers[key] = value;
  }
  return headers;
}

/** `OTEL_TRACES_SAMPLER_ARG` as a ratio in [0, 1]; anything else falls back to 1 (sample all). */
export function resolveSampleRatio(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_SAMPLE_RATIO;
  const ratio = Number(trimmed);
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : DEFAULT_SAMPLE_RATIO;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
