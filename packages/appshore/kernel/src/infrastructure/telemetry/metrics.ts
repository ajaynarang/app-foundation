import {
  metrics,
  ValueType,
  type BatchObservableResult,
  type Counter,
  type Gauge,
  type Histogram,
  type Meter,
  type MeterProvider,
  type ObservableGauge,
} from '@opentelemetry/api';
import type { OutboundChannel } from '../outbound/outbound-channel';

export { OUTBOUND_CHANNEL, type OutboundChannel } from '../outbound/outbound-channel';

/**
 * Every metric the foundation emits, in one place, so the label sets stay reviewed and bounded
 * (docs/standards/observability.md, rule 9). Instruments are created only in this file; the log-hygiene spec fails
 * on a `createCounter` (or any other instrument factory) anywhere else.
 *
 * Label rules:
 *  - Never userId, requestId, jobId, phone, email, token or an amount.
 *  - `tenant` only on `app_job_failed`, `app_ai_invocation` and `app_ai_invocation_cost_usd`. Its value is the same
 *    `tenantId` the log line carries, or `none`, and a process gives at most `METRICS_TENANT_LABEL_MAX` distinct
 *    tenants their own value; every later one is `other` (`toTenantLabel`).
 *  - Every other label is a code constant (queue, job name, enum value) or is normalised here into a closed set.
 *  - No `provider`, `route` or `model` label: a tenant's own key or route would multiply series. Those stay on the
 *    `AiInvocation` row and in Langfuse.
 *  - `env` is added to every point at export (EnvLabelMetricExporter), never here.
 *
 * Prometheus names (the OTLP translation): counters gain `_total`; a unit of `s` adds `_seconds` unless the name
 * already ends in it. Products sharing one metrics backend are told apart by the `service` label, not the prefix.
 *
 * With no OTLP endpoint there is no meter provider and every call below is a no-op. Instruments are resolved against
 * the current global provider, so importing this file before the SDK starts (or a test swapping providers) never pins
 * a no-op meter.
 */
export const METER_NAME = 'app-backend';

/** The prefix of every foundation instrument. A constant, never per product (see above). */
export const METRIC_PREFIX = 'app_';

/** Value of a `tenant` label when the event names no tenant. */
export const NO_TENANT_LABEL = 'none';
/** Value of a `tenant` label once the per-process cap is reached. */
export const OTHER_TENANT_LABEL = 'other';
/** Default for `METRICS_TENANT_LABEL_MAX`: distinct tenants one process labels before the rest read `other`. */
export const DEFAULT_TENANT_LABEL_MAX = 200;

export const OTP_FAILURE_REASON = {
  /** The SMS provider errored or is unreachable: nobody can sign in. */
  PROVIDER: 'provider',
  /** Wrong or expired code: the person's mistake, not an outage. */
  INVALID: 'invalid',
  /** The provider's per-number send or check limits. */
  RATE_LIMITED: 'rate_limited',
} as const;
export type OtpFailureReason = (typeof OTP_FAILURE_REASON)[keyof typeof OTP_FAILURE_REASON];

const AI_LATENCY_BUCKETS_SECONDS = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120];

// ── The tenant label budget ──────────────────────────────────────────────

const labelledTenants = new Set<string>();

function tenantLabelMax(): number {
  const raw = Number(process.env.METRICS_TENANT_LABEL_MAX?.trim());
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : DEFAULT_TENANT_LABEL_MAX;
}

/**
 * The `tenant` label: the log line's tenantId, or `none`. The first `METRICS_TENANT_LABEL_MAX` distinct tenants this
 * process sees keep their own value; every later one is `other`, so a large tenant base cannot multiply series.
 */
export function toTenantLabel(tenantId: string | number | null | undefined): string {
  if (tenantId === null || tenantId === undefined) return NO_TENANT_LABEL;
  const label = String(tenantId).trim();
  if (!label) return NO_TENANT_LABEL;
  if (labelledTenants.has(label)) return label;
  if (labelledTenants.size >= tenantLabelMax()) return OTHER_TENANT_LABEL;
  labelledTenants.add(label);
  return label;
}

/** Test seam: forget which tenants were labelled. */
export function resetTenantLabelsForTesting(): void {
  labelledTenants.clear();
}

// ── Instruments ──────────────────────────────────────────────────────────

interface Instruments {
  jobFailed: Counter;
  cronLastSuccess: Gauge;
  otpFailed: Counter;
  outboundFailed: Counter;
  aiInvocation: Counter;
  aiInvocationDuration: Histogram;
  aiInvocationCost: Counter;
  outboxOldestUnpublished: Gauge;
  deadlineOldestDue: Gauge;
}

function createInstruments(meter: Meter): Instruments {
  return {
    jobFailed: meter.createCounter('app_job_failed', {
      description: 'BullMQ job attempt failed {queue, job_name, final, tenant}',
    }),
    cronLastSuccess: meter.createGauge('app_cron_last_success_timestamp_seconds', {
      description: 'Unix time the cron last completed a run {job_name}',
      unit: 's',
      valueType: ValueType.INT,
    }),
    otpFailed: meter.createCounter('app_otp_failed', {
      description: 'Sign-in code send or check failed {reason}',
    }),
    outboundFailed: meter.createCounter('app_outbound_failed', {
      description: 'Outbound email, SMS, push, WhatsApp or webhook send failed {channel}',
    }),
    aiInvocation: meter.createCounter('app_ai_invocation', {
      description: 'AI invocations recorded in the cost ledger {surface, status, tenant}',
    }),
    aiInvocationDuration: meter.createHistogram('app_ai_invocation_duration', {
      description: 'AI invocation latency {surface, status}',
      unit: 's',
      advice: { explicitBucketBoundaries: AI_LATENCY_BUCKETS_SECONDS },
    }),
    aiInvocationCost: meter.createCounter('app_ai_invocation_cost_usd', {
      description: 'AI spend in USD as priced into the cost ledger {surface, tenant}',
      valueType: ValueType.DOUBLE,
    }),
    outboxOldestUnpublished: meter.createGauge('app_outbox_oldest_unpublished_seconds', {
      description: 'Age of the oldest committed outbox event not yet published; 0 when nothing waits',
      unit: 's',
    }),
    deadlineOldestDue: meter.createGauge('app_deadline_oldest_due_seconds', {
      description: 'How long the oldest pending deadline has been past its due time; 0 when none is',
      unit: 's',
    }),
  };
}

let cached: { provider: MeterProvider; instruments: Instruments } | undefined;

function instruments(): Instruments {
  const provider = metrics.getMeterProvider();
  if (cached?.provider !== provider) {
    cached = { provider, instruments: createInstruments(provider.getMeter(METER_NAME)) };
  }
  return cached.instruments;
}

// ── Jobs and crons ───────────────────────────────────────────────────────

export interface JobFailedLabels {
  queue: string | undefined;
  jobName: string;
  final: boolean;
  tenantId: string | number | null | undefined;
}

export function recordJobFailed(labels: JobFailedLabels): void {
  instruments().jobFailed.add(1, {
    queue: labels.queue || 'unknown',
    job_name: labels.jobName,
    final: String(labels.final),
    tenant: toTenantLabel(labels.tenantId),
  });
}

export function recordCronSuccess(jobName: string, at: Date = new Date()): void {
  instruments().cronLastSuccess.record(Math.floor(at.getTime() / 1000), { job_name: jobName });
}

// ── Features ─────────────────────────────────────────────────────────────

export function recordOtpFailed(reason: OtpFailureReason): void {
  instruments().otpFailed.add(1, { reason });
}

export function recordOutboundFailed(channel: OutboundChannel, count = 1): void {
  if (count <= 0) return;
  instruments().outboundFailed.add(count, { channel });
}

export interface AiInvocationMetric {
  /** `AiSurface` enum value; lowercased into the label. */
  surface: string;
  /** `AiInvocationStatus` enum value; lowercased, so a healthy call is `ok`. */
  status: string;
  /** The tenant's public string id, the one the log line carries. */
  tenantId: string | null | undefined;
  latencyMs?: number | null;
  /** Null when no pricing row matched: the call is counted, the spend is not. */
  costUsd?: number | null;
}

export function recordAiInvocation(invocation: AiInvocationMetric): void {
  const surface = invocation.surface.toLowerCase();
  const status = invocation.status.toLowerCase();
  const tenant = toTenantLabel(invocation.tenantId);
  const instrumentSet = instruments();
  instrumentSet.aiInvocation.add(1, { surface, status, tenant });
  if (typeof invocation.latencyMs === 'number' && invocation.latencyMs >= 0) {
    instrumentSet.aiInvocationDuration.record(invocation.latencyMs / 1000, { surface, status });
  }
  if (typeof invocation.costUsd === 'number' && invocation.costUsd > 0) {
    instrumentSet.aiInvocationCost.add(invocation.costUsd, { surface, tenant });
  }
}

// ── Outbox and deadlines (no labels) ─────────────────────────────────────

/** Seconds since the oldest unpublished outbox event committed; 0 when nothing waits. */
export function recordOutboxOldestUnpublished(seconds: number): void {
  instruments().outboxOldestUnpublished.record(Math.max(0, seconds));
}

/** Seconds the oldest pending deadline is past its due time; 0 when none is due. */
export function recordDeadlineOldestDue(seconds: number): void {
  instruments().deadlineOldestDue.record(Math.max(0, seconds));
}

// ── Queue depth and cron intervals (observable gauges) ───────────────────

export interface QueueDepthSample {
  queue: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  /** Seconds since the oldest waiting job became due; 0 when nothing waits. */
  oldestWaitingSeconds: number;
}

export interface CronIntervalSample {
  jobName: string;
  /** How often the repeatable is meant to run, in seconds. */
  intervalSeconds: number;
}

/**
 * Register the five `app_queue_*` gauges and `app_cron_expected_interval_seconds`, read on each export (every 60 s).
 * Returns the unregister function. The caller decides which single process reports (`reportsOpsGauges()`), so the
 * API and the worker never both publish the same numbers. A repeatable that a sample no longer returns (a schedule
 * disabled or removed) has no series from the next export on, so `cron-missed` stays silent for it.
 */
export function registerQueueGauges(
  sampleQueues: () => Promise<QueueDepthSample[]>,
  sampleCrons: () => Promise<CronIntervalSample[]>,
): () => void {
  const meter = metrics.getMeterProvider().getMeter(METER_NAME);
  const queueGauges: Record<Exclude<keyof QueueDepthSample, 'queue'>, ObservableGauge> = {
    waiting: meter.createObservableGauge('app_queue_waiting', {
      description: 'Jobs waiting to run, including paused and prioritized {queue}',
      valueType: ValueType.INT,
    }),
    active: meter.createObservableGauge('app_queue_active', {
      description: 'Jobs running now {queue}',
      valueType: ValueType.INT,
    }),
    failed: meter.createObservableGauge('app_queue_failed', {
      description: 'Jobs in the failed set {queue}',
      valueType: ValueType.INT,
    }),
    delayed: meter.createObservableGauge('app_queue_delayed', {
      description: 'Jobs scheduled for later, retries in backoff included {queue}',
      valueType: ValueType.INT,
    }),
    oldestWaitingSeconds: meter.createObservableGauge('app_queue_oldest_waiting_seconds', {
      description: 'Age of the oldest waiting job since it became due {queue}',
      unit: 's',
    }),
  };
  const cronInterval = meter.createObservableGauge('app_cron_expected_interval_seconds', {
    description: 'How often a repeatable of a minute or more is meant to run {job_name}',
    unit: 's',
  });

  const callback = async (result: BatchObservableResult): Promise<void> => {
    const [depths, crons] = await Promise.all([sampleQueues(), sampleCrons()]);
    for (const depth of depths) {
      const attributes = { queue: depth.queue };
      result.observe(queueGauges.waiting, depth.waiting, attributes);
      result.observe(queueGauges.active, depth.active, attributes);
      result.observe(queueGauges.failed, depth.failed, attributes);
      result.observe(queueGauges.delayed, depth.delayed, attributes);
      result.observe(queueGauges.oldestWaitingSeconds, depth.oldestWaitingSeconds, attributes);
    }
    for (const cron of crons) {
      result.observe(cronInterval, cron.intervalSeconds, { job_name: cron.jobName });
    }
  };
  const observables = [...Object.values(queueGauges), cronInterval];
  meter.addBatchObservableCallback(callback, observables);
  return () => meter.removeBatchObservableCallback(callback, observables);
}
