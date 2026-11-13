import type { HistogramMetricData } from '@opentelemetry/sdk-metrics';
import {
  DEFAULT_TENANT_LABEL_MAX,
  NO_TENANT_LABEL,
  OTHER_TENANT_LABEL,
  OTP_FAILURE_REASON,
  OUTBOUND_CHANNEL,
  recordAiInvocation,
  recordCronSuccess,
  recordDeadlineOldestDue,
  recordJobFailed,
  recordOtpFailed,
  recordOutboundFailed,
  recordOutboxOldestUnpublished,
  registerQueueGauges,
  resetTenantLabelsForTesting,
  toTenantLabel,
} from '../metrics';
import { InMemoryMetrics } from '../testing/in-memory-metrics';

/** Labels a metric may never carry (rule 9): ids and personal data belong in logs. */
const FORBIDDEN_LABELS = ['userId', 'user_id', 'requestId', 'request_id', 'jobId', 'job_id', 'phone', 'email'];

describe('foundation metrics', () => {
  let harness: InMemoryMetrics;

  beforeEach(() => {
    resetTenantLabelsForTesting();
    harness = InMemoryMetrics.install();
  });

  afterEach(async () => {
    await harness.uninstall();
  });

  async function pointsOf(name: string) {
    const points = await harness.points(name);
    for (const point of points) {
      for (const label of FORBIDDEN_LABELS) expect(point.attributes).not.toHaveProperty(label);
    }
    return points;
  }

  describe('job and cron instruments', () => {
    it('counts a job failure by queue, job_name, final and tenant', async () => {
      recordJobFailed({ queue: 'bulk-ops', jobName: 'trial-expiry', final: true, tenantId: 'acme' });

      const [point] = await pointsOf('app_job_failed');
      expect(point.attributes).toEqual({ queue: 'bulk-ops', job_name: 'trial-expiry', final: 'true', tenant: 'acme' });
      expect(point.value).toBe(1);
    });

    it('keeps retries and final failures as separate series', async () => {
      recordJobFailed({ queue: 'events', jobName: 'x', final: false, tenantId: 'acme' });
      recordJobFailed({ queue: 'events', jobName: 'x', final: true, tenantId: 'acme' });

      const finals = (await pointsOf('app_job_failed')).map((p) => p.attributes.final).sort();
      expect(finals).toEqual(['false', 'true']);
    });

    it('labels a job with no tenant and no queue as none / unknown', async () => {
      recordJobFailed({ queue: undefined, jobName: 'ops-heartbeat', final: true, tenantId: undefined });

      const [point] = await pointsOf('app_job_failed');
      expect(point.attributes).toMatchObject({ queue: 'unknown', tenant: NO_TENANT_LABEL });
    });

    it('records the cron success time in unix seconds, labelled job_name', async () => {
      recordCronSuccess('data-retention', new Date('2026-10-29T03:00:00.900Z'));

      const metric = await harness.metric('app_cron_last_success_timestamp_seconds');
      expect(metric?.descriptor.unit).toBe('s');
      expect(metric?.dataPoints[0]).toMatchObject({
        attributes: { job_name: 'data-retention' },
        value: Date.parse('2026-10-29T03:00:00Z') / 1000,
      });
    });

    it('keeps the latest cron success, not the first', async () => {
      recordCronSuccess('job-cleanup', new Date('2026-10-28T00:00:00Z'));
      recordCronSuccess('job-cleanup', new Date('2026-10-29T00:00:00Z'));

      const [point] = await pointsOf('app_cron_last_success_timestamp_seconds');
      expect(point.value).toBe(Date.parse('2026-10-29T00:00:00Z') / 1000);
    });
  });

  describe('feature instruments', () => {
    it('counts OTP failures by reason only', async () => {
      recordOtpFailed(OTP_FAILURE_REASON.PROVIDER);
      recordOtpFailed(OTP_FAILURE_REASON.INVALID);
      recordOtpFailed(OTP_FAILURE_REASON.INVALID);

      const byReason = Object.fromEntries(
        (await pointsOf('app_otp_failed')).map((p) => [p.attributes.reason, p.value]),
      );
      expect(byReason).toEqual({ provider: 1, invalid: 2 });
    });

    it('counts outbound failures by channel, and several at once', async () => {
      recordOutboundFailed(OUTBOUND_CHANNEL.SMS);
      recordOutboundFailed(OUTBOUND_CHANNEL.PUSH, 3);
      recordOutboundFailed(OUTBOUND_CHANNEL.PUSH, 0);

      const byChannel = Object.fromEntries(
        (await pointsOf('app_outbound_failed')).map((p) => [p.attributes.channel, p.value]),
      );
      expect(byChannel).toEqual({ sms: 1, push: 3 });
    });

    it('has the five outbound channels the gate and the metric share', () => {
      expect(Object.values(OUTBOUND_CHANNEL).sort()).toEqual(['email', 'push', 'sms', 'webhook', 'whatsapp']);
    });
  });

  describe('AI instruments', () => {
    it('counts an invocation with lowercased surface and status plus tenant', async () => {
      recordAiInvocation({ surface: 'CHAT', status: 'OK', tenantId: 'acme', latencyMs: 1500, costUsd: 0.0125 });

      const [point] = await pointsOf('app_ai_invocation');
      expect(point.attributes).toEqual({ surface: 'chat', status: 'ok', tenant: 'acme' });
    });

    it('records latency in seconds without a tenant label', async () => {
      recordAiInvocation({ surface: 'KB_INGEST', status: 'ERROR', tenantId: 'acme', latencyMs: 1500 });

      const metric = (await harness.metric('app_ai_invocation_duration')) as HistogramMetricData;
      expect(metric.descriptor.unit).toBe('s');
      expect(metric.dataPoints[0].attributes).toEqual({ surface: 'kb_ingest', status: 'error' });
      expect(metric.dataPoints[0].value.sum).toBe(1.5);
    });

    it('adds the priced cost in USD by surface and tenant', async () => {
      recordAiInvocation({ surface: 'EMBEDDING', status: 'OK', tenantId: 'beta', costUsd: 0.25 });
      recordAiInvocation({ surface: 'EMBEDDING', status: 'OK', tenantId: 'beta', costUsd: 0.5 });

      const [point] = await pointsOf('app_ai_invocation_cost_usd');
      expect(point.attributes).toEqual({ surface: 'embedding', tenant: 'beta' });
      expect(point.value).toBeCloseTo(0.75, 10);
    });

    it('counts an unpriced call but adds no spend and no latency it does not have', async () => {
      recordAiInvocation({ surface: 'VOICE', status: 'OK', tenantId: 'beta', costUsd: null, latencyMs: null });

      expect(await pointsOf('app_ai_invocation')).toHaveLength(1);
      expect(await pointsOf('app_ai_invocation_cost_usd')).toHaveLength(0);
      expect(await pointsOf('app_ai_invocation_duration')).toHaveLength(0);
    });
  });

  describe('outbox and deadline gauges', () => {
    it('records the oldest unpublished outbox age and the oldest due deadline, with no labels', async () => {
      recordOutboxOldestUnpublished(42);
      recordDeadlineOldestDue(-5);

      expect(await pointsOf('app_outbox_oldest_unpublished_seconds')).toEqual([
        expect.objectContaining({ attributes: {}, value: 42 }),
      ]);
      expect(await pointsOf('app_deadline_oldest_due_seconds')).toEqual([
        expect.objectContaining({ attributes: {}, value: 0 }),
      ]);
    });
  });

  describe('queue depth and cron interval gauges', () => {
    it('publishes the five gauges per queue and one interval per cron on each collection', async () => {
      const sampleQueues = jest
        .fn()
        .mockResolvedValue([
          { queue: 'events', waiting: 4, active: 1, failed: 2, delayed: 3, oldestWaitingSeconds: 12.5 },
        ]);
      const sampleCrons = jest.fn().mockResolvedValue([{ jobName: 'data-retention', intervalSeconds: 86_400 }]);
      const unregister = registerQueueGauges(sampleQueues, sampleCrons);

      const expected: Record<string, number> = {
        app_queue_waiting: 4,
        app_queue_active: 1,
        app_queue_failed: 2,
        app_queue_delayed: 3,
        app_queue_oldest_waiting_seconds: 12.5,
      };
      for (const [name, value] of Object.entries(expected)) {
        expect((await pointsOf(name))[0]).toMatchObject({ attributes: { queue: 'events' }, value });
      }
      expect((await pointsOf('app_cron_expected_interval_seconds'))[0]).toMatchObject({
        attributes: { job_name: 'data-retention' },
        value: 86_400,
      });
      unregister();
    });

    it('stops polling once unregistered', async () => {
      const sampleQueues = jest.fn().mockResolvedValue([]);
      const unregister = registerQueueGauges(sampleQueues, jest.fn().mockResolvedValue([]));
      await harness.collect();
      const callsWhileRegistered = sampleQueues.mock.calls.length;

      unregister();
      await harness.collect();

      expect(callsWhileRegistered).toBe(1);
      expect(sampleQueues).toHaveBeenCalledTimes(1);
    });
  });

  it('is a no-op with no meter provider (no OTLP endpoint)', async () => {
    await harness.uninstall();

    expect(() => {
      recordJobFailed({ queue: 'events', jobName: 'x', final: true, tenantId: 'acme' });
      recordAiInvocation({ surface: 'CHAT', status: 'OK', tenantId: 'acme', latencyMs: 5, costUsd: 1 });
      recordOutboxOldestUnpublished(1);
      registerQueueGauges(jest.fn(), jest.fn())();
    }).not.toThrow();
    harness = InMemoryMetrics.install();
  });
});

describe('toTenantLabel', () => {
  const original = process.env.METRICS_TENANT_LABEL_MAX;

  beforeEach(() => resetTenantLabelsForTesting());

  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_TENANT_LABEL_MAX;
    else process.env.METRICS_TENANT_LABEL_MAX = original;
  });

  it('uses the logged tenantId, or none', () => {
    expect(toTenantLabel('acme')).toBe('acme');
    expect(toTenantLabel(' beta ')).toBe('beta');
    expect(toTenantLabel('')).toBe(NO_TENANT_LABEL);
    expect(toTenantLabel(null)).toBe(NO_TENANT_LABEL);
    expect(toTenantLabel(undefined)).toBe(NO_TENANT_LABEL);
  });

  it('gives the first METRICS_TENANT_LABEL_MAX tenants their own value and every later one other', () => {
    process.env.METRICS_TENANT_LABEL_MAX = '2';

    expect(toTenantLabel('t1')).toBe('t1');
    expect(toTenantLabel('t2')).toBe('t2');
    expect(toTenantLabel('t3')).toBe(OTHER_TENANT_LABEL);
    // A tenant already labelled keeps its value; none never spends a slot.
    expect(toTenantLabel('t1')).toBe('t1');
    expect(toTenantLabel(null)).toBe(NO_TENANT_LABEL);
  });

  it('defaults the cap to 200 and ignores a value that is not a whole number', () => {
    process.env.METRICS_TENANT_LABEL_MAX = 'lots';
    expect(DEFAULT_TENANT_LABEL_MAX).toBe(200);

    const labels = Array.from({ length: 201 }, (_, i) => toTenantLabel(`t${i}`));

    expect(labels[199]).toBe('t199');
    expect(labels[200]).toBe(OTHER_TENANT_LABEL);
  });

  it('caps the series a burst of tenants can create on a real instrument', async () => {
    process.env.METRICS_TENANT_LABEL_MAX = '3';
    const harness = InMemoryMetrics.install();

    for (let i = 0; i < 10; i++) recordJobFailed({ queue: 'events', jobName: 'x', final: true, tenantId: `t${i}` });

    const tenants = (await harness.points('app_job_failed')).map((p) => p.attributes.tenant).sort();
    expect(tenants).toEqual(['other', 't0', 't1', 't2']);
    await harness.uninstall();
  });
});
