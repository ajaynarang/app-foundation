// The alert rule catalog: one area per rule group, environment-agnostic. build-alerting.mjs turns each area into one
// provisioning file per area holding that area's group for every environment.
//
// A rule:
//   {
//     key: 'api-5xx-rate',            // unique; the rule uid is `<env short>-<key>`, at most 40 characters
//     title: 'API 5xx rate',
//     severity: 'sev1' | 'sev2',      // sev1 in production pages (irm-oncall); everything else notifies
//     kind: 'loki' | 'prom' | 'cloudwatch',
//     expr: (env) => '…',             // loki/prom: the query, filtered on env="<env>"; the comparison lives in the
//                                     // query, so "no rows" is healthy and the condition is A > 0
//     metric: (envSpec) => ({ namespace, metricName, statistic, dimensions }),   // cloudwatch only
//     reducer, op, threshold,         // cloudwatch only; threshold may be (envSpec) => number
//     windowSec: 600,                 // the query's look-back
//     for: '5m',                      // optional pending period
//     noData: 'OK' | 'Alerting' | 'NoData',
//     requiresWorker: true,           // optional: generated only while HAS_WORKER is true
//     summary, description,
//     runbook: 'api.md#api-5xx-rate', // a file under docs/runbooks/ and one of its `## <key>` headings
//   }
//
// Rules ship live, never paused: the template has no older rules to swap them in for. One signal per rule: a rule
// reads logs or metrics, never both, so there is no paired log-and-metric rule to keep in step.
//
// An area: { area: 'api', interval: '1m', rules: [...] }, or { area, groups: [{ name, interval, rules }] } when its
// rules need different evaluation intervals.

import { awsNames, metricMatcher as m, streamSelector as sel } from './constants.mjs';

const MIN = 60;
const HOUR = 3600;
const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

// ---- api and SLOs ---------------------------------------------------------------------------------------------

/** The one line a 5xx writes: `<METHOD> <path> - Status: <code> <CODE> - <detail>`, from writeErrorEnvelope. */
const api5xx = (env) =>
  `${sel(env)} |= "Status: 5" | json | context="HttpExceptionFilter" | msg=~".*Status: 5[0-9][0-9].*"`;

/** 99.5% availability of non-4xx requests: the error budget is 0.5%. The SLO board draws the same ratio. */
const ERROR_BUDGET = 0.005;
const HTTP = 'http_server_request_duration_seconds';
const errorRatio = (env, window) =>
  `(sum(rate(${HTTP}_count{${m(env, 'http_response_status_code=~"5.."')}}[${window}]))` +
  ` / sum(rate(${HTTP}_count{${m(env, 'http_response_status_code!~"4.."')}}[${window}])))`;
/** Multi-window burn: the long window proves it is sustained, the short one that it is still happening. */
const burn = (env, factor, longWindow, shortWindow) =>
  `${errorRatio(env, longWindow)} > (${factor} * ${ERROR_BUDGET})` +
  ` and ${errorRatio(env, shortWindow)} > (${factor} * ${ERROR_BUDGET})`;

const api = {
  area: 'api',
  interval: '1m',
  rules: [
    {
      key: 'api-5xx-rate',
      title: 'API 5xx rate',
      severity: 'sev1',
      kind: 'loki',
      windowSec: 5 * MIN,
      expr: (env) => `sum(count_over_time(${api5xx(env)} [5m])) >= 5`,
      summary: 'The API answered 5 or more 5xx responses in 5 minutes',
      description:
        'writeErrorEnvelope logged at least five server errors in five minutes. A load balancer answering 502, 503 or 504 with no healthy target writes no such line: the outside-in uptime check covers that.',
      runbook: 'api.md#api-5xx-rate',
    },
    {
      key: 'api-availability-burn-fast',
      title: 'API availability SLO fast burn (14.4x, 1 h)',
      severity: 'sev1',
      kind: 'prom',
      windowSec: HOUR,
      expr: (env) => burn(env, 14.4, '1h', '5m'),
      summary: 'The API is burning its 99.5% availability budget 14.4 times too fast',
      description:
        'The 5xx share of non-4xx requests is above 7.2% over both 1 h and 5 min. At this rate the 30-day error budget is gone in about two days.',
      runbook: 'api.md#api-availability-burn-fast',
    },
    {
      key: 'api-availability-burn-slow',
      title: 'API availability SLO slow burn (6x, 6 h)',
      severity: 'sev2',
      kind: 'prom',
      windowSec: 6 * HOUR,
      expr: (env) => burn(env, 6, '6h', '30m'),
      summary: 'The API is burning its 99.5% availability budget 6 times too fast',
      description: 'The 5xx share of non-4xx requests is above 3% over both 6 h and 30 min.',
      runbook: 'api.md#api-availability-burn-slow',
    },
    {
      key: 'api-latency-p95',
      title: 'API p95 latency above 1 s',
      severity: 'sev2',
      kind: 'prom',
      windowSec: 10 * MIN,
      for: '10m',
      expr: (env) => `histogram_quantile(0.95, sum by (le) (rate(${HTTP}_bucket{${m(env)}}[10m]))) > 1`,
      summary: 'API p95 latency has been above 1 s for 10 minutes',
      description: 'The latency SLO is p95 under 1 s. This fires after ten minutes above it.',
      runbook: 'api.md#api-latency-p95',
    },
  ],
};

// ---- queues, jobs, crons, outbox and deadlines --------------------------------------------------------------

const JOB_FAILED = (env) => `${sel(env)} |= "job.failed" | json | event="job.failed"`;

/**
 * The shared lane. `bulk-ops` runs one job at a time and carries the outbox relay, the deadline sweeper, the
 * heartbeat and the foundation crons. No job may hold it for more than five minutes (the lane budget), so every rule
 * that a long job on that lane could trip waits three times the budget.
 */
const LANE_BUDGET_SEC = 5 * MIN;
const LANE_WINDOW_SEC = 3 * LANE_BUDGET_SEC;

/**
 * How far back cron-missed looks for a cron's last success. A process only holds the stamp after a success in its own
 * lifetime, so after a deploy the series lives on only in this window. It must exceed twice the longest interval
 * (the foundation's crons are daily); a product with a cron rarer than every four days lengthens it.
 */
const CRON_LOOKBACK = '8d';

const jobs = {
  area: 'jobs',
  interval: '1m',
  rules: [
    {
      key: 'job-failed-final',
      title: 'Background job failed its final attempt',
      severity: 'sev1',
      kind: 'loki',
      windowSec: 15 * MIN,
      expr: (env) => `sum by (jobName, queue, tenantId) (count_over_time(${JOB_FAILED(env)} | final="true" [15m])) > 0`,
      summary: 'Job {{ .Labels.jobName }} on {{ .Labels.queue }} failed its final attempt',
      description:
        'A job.failed line with final=true: BullMQ will not retry it. One alert per job name, queue and tenant.',
      runbook: 'queues-jobs.md#job-failed-final',
    },
    {
      key: 'job-unknown',
      title: 'Job with no handler',
      severity: 'sev2',
      kind: 'loki',
      windowSec: 15 * MIN,
      expr: (env) =>
        `sum by (jobName, queue) (count_over_time(${sel(env)} |= "job.unknown" | json | event="job.unknown" [15m])) > 0`,
      summary: 'A job named {{ .Labels.jobName }} reached a dispatcher with no handler',
      description: 'A job.unknown line: a queue received a job name nothing handles. Usually a deploy-order bug.',
      runbook: 'queues-jobs.md#job-unknown',
    },
    {
      key: 'worker-heartbeat-missing',
      title: 'Heartbeat missing',
      severity: 'sev1',
      kind: 'loki',
      windowSec: LANE_WINDOW_SEC,
      // Selected by message, not by process role: it fires on whichever process consumes bulk-ops, worker or API.
      expr: (env) => `absent_over_time(${sel(env)} |= "ops.heartbeat" | json | event="ops.heartbeat" [15m])`,
      summary: 'No ops.heartbeat line for 15 minutes: the bulk-ops lane is not being consumed',
      description:
        'The heartbeat is a repeatable job on bulk-ops every five minutes. Three missed beats mean Redis, the scheduler or every consumer is broken, or one job has held the lane far past its five-minute budget.',
      runbook: 'queues-jobs.md#worker-heartbeat-missing',
    },
    {
      key: 'queue-stalled',
      title: 'Queue stalled',
      severity: 'sev1',
      kind: 'prom',
      windowSec: 5 * MIN,
      expr: (env) => `max by (queue) (app_queue_oldest_waiting_seconds{${m(env)}}) > ${LANE_WINDOW_SEC}`,
      summary: 'Queue {{ .Labels.queue }} has had a job waiting for more than 15 minutes',
      description:
        'app_queue_oldest_waiting_seconds is above 900 s: nothing is draining the queue, or one job holds a one-at-a-time lane.',
      runbook: 'queues-jobs.md#queue-stalled',
    },
    {
      key: 'outbox-backlog',
      title: 'Outbox backlog',
      severity: 'sev1',
      kind: 'prom',
      windowSec: 5 * MIN,
      expr: (env) => `max(app_outbox_oldest_unpublished_seconds{${m(env)}}) > ${LANE_WINDOW_SEC}`,
      summary: 'A committed outbox event has waited more than 15 minutes to be published',
      description:
        'The relay sweeps every 10 s and picks up events older than 30 s; the normal path publishes right after commit. An event 15 minutes old means the relay is not running or keeps failing, so subscribers, webhooks and notifications behind it are late.',
      runbook: 'queues-jobs.md#outbox-backlog',
    },
    {
      key: 'deadline-sweep-late',
      title: 'Deadline sweep late',
      severity: 'sev1',
      kind: 'prom',
      windowSec: 5 * MIN,
      expr: (env) => `max(app_deadline_oldest_due_seconds{${m(env)}}) > ${LANE_WINDOW_SEC}`,
      summary: 'A pending deadline has been past due for more than 15 minutes',
      description:
        'The deadline sweep runs every 30 s. A deadline 15 minutes past due means the sweep is not running or not reaching it, so timers are not firing. A failing handler does not trip this rule: its rows show as FAILING on /admin/timers and each failed run is reported to Sentry.',
      runbook: 'queues-jobs.md#deadline-sweep-late',
    },
  ],
};

const crons = {
  area: 'crons',
  groups: [
    {
      name: 'crons',
      interval: '5m',
      rules: [
        {
          key: 'cron-missed',
          title: 'Cron missed',
          severity: 'sev1',
          kind: 'prom',
          windowSec: 5 * MIN,
          // One rule for every cron: a job with an expected interval (only repeatables BullMQ holds, a minute or
          // more) whose last success is older than twice it. last_over_time keeps the stamp across a deploy; max
          // folds every reporting task. A cron that has never succeeded has no stamp and is not reported here: its
          // failures reach job-failed-final.
          expr: (env) =>
            `(time() - max by (job_name) (last_over_time(app_cron_last_success_timestamp_seconds{${m(env)}}[${CRON_LOOKBACK}])))` +
            ` > 2 * max by (job_name) (app_cron_expected_interval_seconds{${m(env)}})`,
          summary: 'Cron {{ .Labels.job_name }} has not succeeded in twice its interval',
          description:
            'The last success of this cron is older than twice the interval its schedule sets. A disabled schedule has no interval and never fires this.',
          runbook: 'queues-jobs.md#cron-missed',
        },
      ],
    },
    {
      name: 'crons-daily',
      interval: '1h',
      rules: [
        {
          key: 'cron-tenants-failed',
          title: 'Cron completed with failed tenants',
          severity: 'sev2',
          kind: 'loki',
          windowSec: 25 * HOUR,
          expr: (env) =>
            `sum by (jobName) (count_over_time(${sel(env)} |= "cron.completed" | json | event="cron.completed" | tenantsFailed > 0 [25h])) > 0`,
          summary: 'Cron {{ .Labels.jobName }} finished but failed for one or more tenants',
          description:
            'A cron.completed line with tenantsFailed above zero in the last 25 h. It resolves 25 h after the last partly failed run.',
          runbook: 'queues-jobs.md#cron-tenants-failed',
        },
      ],
    },
  ],
};

// ---- outbound and sign-in codes -------------------------------------------------------------------------------

const outbound = {
  area: 'outbound',
  interval: '1m',
  rules: [
    {
      key: 'outbound-failures',
      title: 'Outbound send failures',
      // sev2: outside development a send with no provider key fails and counts here by design, and a product may run
      // without email at first. Sign-in codes, which block people, have their own sev1 below.
      severity: 'sev2',
      kind: 'prom',
      windowSec: 10 * MIN,
      expr: (env) => `sum by (channel) (increase(app_outbound_failed_total{${m(env)}}[10m])) >= 3`,
      summary: '{{ .Labels.channel }} failed 3 or more sends in 10 minutes',
      description:
        'app_outbound_failed_total rose by three or more for one channel (email, sms, push, whatsapp, webhook).',
      runbook: 'outbound.md#outbound-failures',
    },
    {
      key: 'otp-provider-failures',
      title: 'Sign-in code provider failures',
      severity: 'sev1',
      kind: 'prom',
      windowSec: 10 * MIN,
      expr: (env) => `sum(increase(app_otp_failed_total{${m(env, 'reason="provider"')}}[10m])) >= 5`,
      summary: 'The sign-in code provider failed 5 or more times in 10 minutes: phone sign-in is broken',
      description:
        'app_otp_failed_total{reason="provider"} rose by five or more. Wrong or expired codes (reason invalid) and provider rate limits are not counted.',
      runbook: 'outbound.md#otp-provider-failures',
    },
  ],
};

// ---- AI -------------------------------------------------------------------------------------------------------

/** AiInvocationStatus values that are failures. BUDGET_BLOCKED is a tenant's own limit, not an error. */
const AI_FAILED = 'status=~"error|timeout|rate_limited"';
const AI_MIN_CALLS = 5;

const ai = {
  area: 'ai',
  interval: '1m',
  rules: [
    {
      key: 'ai-error-ratio',
      title: 'AI error ratio above 20%',
      severity: 'sev2',
      kind: 'prom',
      windowSec: 15 * MIN,
      expr: (env) =>
        `(sum(increase(app_ai_invocation_total{${m(env, AI_FAILED)}}[15m])) / sum(increase(app_ai_invocation_total{${m(env)}}[15m])) > 0.2)` +
        ` and (sum(increase(app_ai_invocation_total{${m(env)}}[15m])) >= ${AI_MIN_CALLS})`,
      summary: 'More than 20% of AI invocations failed in 15 minutes',
      description: `Errors, timeouts and provider rate limits over all invocations in the cost ledger, once there are at least ${AI_MIN_CALLS} in the window. Budget refusals do not count.`,
      runbook: 'ai.md#ai-error-ratio',
    },
  ],
};

// ---- infrastructure (CloudWatch) ------------------------------------------------------------------------------

/** CloudWatch rules: `reducer` folds the window, `op`/`threshold` decide. */
const cw = (namespace, metricName, statistic, dimensions) => ({ namespace, metricName, statistic, dimensions });
const rdsId = (envSpec) => ({ DBInstanceIdentifier: awsNames(envSpec.awsPrefix).rds });
/** Share of `max_connections` that alerts (rdsMaxConnections per environment, in constants.mjs). */
const RDS_CONNECTIONS_SHARE = 0.75;
export const rdsConnectionsThreshold = (envSpec) => Math.floor(envSpec.rdsMaxConnections * RDS_CONNECTIONS_SHARE);

// RDS, Redis and the API service always exist, so no data means broken (or a wrong PROJECT prefix): alerting.
const INFRA_NO_DATA = 'Alerting';

const ecsGone = (service) => ({
  key: `ecs-service-gone-${service}`,
  title: `ECS ${service} service gone`,
  severity: 'sev1',
  kind: 'cloudwatch',
  windowSec: 10 * MIN,
  noData: INFRA_NO_DATA,
  requiresWorker: service === 'worker',
  metric: (envSpec) =>
    cw('AWS/ECS', 'CPUUtilization', 'Average', {
      ClusterName: awsNames(envSpec.awsPrefix).cluster,
      ServiceName: awsNames(envSpec.awsPrefix).service(service),
    }),
  reducer: 'last',
  op: 'lt',
  threshold: 0,
  summary: `No ${service} task has reported CPU for 10 minutes: the ${service} service is down`,
  description: `AWS/ECS CPUUtilization stops arriving when no ${service} task runs (it needs no Container Insights). No data is alerting.`,
  runbook: `infra.md#ecs-service-gone-${service}`,
});

const infra = {
  area: 'infra',
  interval: '5m',
  rules: [
    {
      key: 'rds-storage-low',
      title: 'RDS free storage below 5 GB',
      severity: 'sev1',
      kind: 'cloudwatch',
      windowSec: 10 * MIN,
      noData: INFRA_NO_DATA,
      metric: (envSpec) => cw('AWS/RDS', 'FreeStorageSpace', 'Minimum', rdsId(envSpec)),
      reducer: 'min',
      op: 'lt',
      threshold: 5 * GB,
      summary: 'RDS has less than 5 GB of free storage',
      description: 'Postgres stops accepting writes when the disk fills.',
      runbook: 'infra.md#rds-storage-low',
    },
    {
      key: 'rds-connections-high',
      title: 'RDS connections above 75% of max for 10 min',
      severity: 'sev1',
      kind: 'cloudwatch',
      windowSec: 10 * MIN,
      noData: INFRA_NO_DATA,
      metric: (envSpec) => cw('AWS/RDS', 'DatabaseConnections', 'Maximum', rdsId(envSpec)),
      reducer: 'min',
      op: 'gt',
      threshold: rdsConnectionsThreshold,
      summary: 'RDS has held more than 75% of its max_connections for 10 minutes',
      description:
        'Every 1-minute point in the last 10 minutes is above 75% of the rdsMaxConnections set for this environment. New connections start failing at the limit.',
      runbook: 'infra.md#rds-connections-high',
    },
    {
      key: 'rds-cpu-high',
      title: 'RDS CPU above 80% for 10 min',
      severity: 'sev2',
      kind: 'cloudwatch',
      windowSec: 10 * MIN,
      noData: INFRA_NO_DATA,
      metric: (envSpec) => cw('AWS/RDS', 'CPUUtilization', 'Average', rdsId(envSpec)),
      reducer: 'min',
      op: 'gt',
      threshold: 80,
      summary: 'RDS CPU has been above 80% for 10 minutes',
      description: 'Every 1-minute CPUUtilization point in the last 10 minutes is above 80%.',
      runbook: 'infra.md#rds-cpu-high',
    },
    {
      key: 'rds-freeable-memory-low',
      title: 'RDS freeable memory below 40 MB for 15 min',
      severity: 'sev2',
      kind: 'cloudwatch',
      windowSec: 15 * MIN,
      noData: INFRA_NO_DATA,
      metric: (envSpec) => cw('AWS/RDS', 'FreeableMemory', 'Minimum', rdsId(envSpec)),
      reducer: 'max',
      op: 'lt',
      threshold: 40 * MB,
      summary: 'RDS freeable memory has been below 40 MB for 15 minutes',
      description:
        'Every 1-minute FreeableMemory point in the last 15 minutes is below 40 MB. A small instance idles near 100 MB, so a higher line fires on a healthy database.',
      runbook: 'infra.md#rds-freeable-memory-low',
    },
    {
      key: 'rds-swap-high',
      title: 'RDS swap above 256 MB for 15 min',
      severity: 'sev2',
      kind: 'cloudwatch',
      windowSec: 15 * MIN,
      noData: INFRA_NO_DATA,
      metric: (envSpec) => cw('AWS/RDS', 'SwapUsage', 'Maximum', rdsId(envSpec)),
      reducer: 'min',
      op: 'gt',
      threshold: 256 * MB,
      summary: 'RDS swap has been above 256 MB for 15 minutes',
      description: 'Sustained swap means the instance is out of memory for its working set.',
      runbook: 'infra.md#rds-swap-high',
    },
    {
      key: 'redis-memory-high',
      title: 'Redis memory above 80%',
      severity: 'sev1',
      kind: 'cloudwatch',
      windowSec: 10 * MIN,
      noData: INFRA_NO_DATA,
      // CacheClusterId alone, as a CloudWatch alarm on ElastiCache sets it. Not yet seen against a live account:
      // with matchExact, a metric published only per CacheNodeId would return no data, which pages. The cut-over in
      // docs/observability.md checks each CloudWatch query returns data before these rules replace the alarms.
      metric: (envSpec) =>
        cw('AWS/ElastiCache', 'DatabaseMemoryUsagePercentage', 'Maximum', {
          CacheClusterId: awsNames(envSpec.awsPrefix).redis,
        }),
      reducer: 'last',
      op: 'gt',
      threshold: 80,
      summary: 'Redis memory is above 80%',
      description: 'With noeviction, every write fails at 100%, which stops every queue.',
      runbook: 'infra.md#redis-memory-high',
    },
    ecsGone('api'),
    ecsGone('worker'),
  ],
};

/** @type {Array<{ area: string, interval?: string, rules?: object[], groups?: object[] }>} */
export const RULE_AREAS = [api, jobs, crons, outbound, ai, infra];

/** The starter catalog's rule keys, in the order the design lists them; catalog.test.mjs holds the set. */
export const STARTER_RULE_KEYS = [
  'api-5xx-rate',
  'api-availability-burn-fast',
  'api-availability-burn-slow',
  'api-latency-p95',
  'job-failed-final',
  'job-unknown',
  'worker-heartbeat-missing',
  'queue-stalled',
  'cron-missed',
  'cron-tenants-failed',
  'outbox-backlog',
  'deadline-sweep-late',
  'outbound-failures',
  'otp-provider-failures',
  'ai-error-ratio',
  'rds-storage-low',
  'rds-connections-high',
  'rds-cpu-high',
  'rds-freeable-memory-low',
  'rds-swap-high',
  'redis-memory-high',
  'ecs-service-gone-api',
  'ecs-service-gone-worker',
];
