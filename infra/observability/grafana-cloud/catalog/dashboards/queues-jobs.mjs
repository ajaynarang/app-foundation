import { M, SEL, dashboard, loki, prom, steps, stepsLowBad } from './kit.mjs';

const JOB_FAILED = `${SEL} |= "job.failed" | json | event="job.failed"`;
const CRON = `${SEL} |= "cron.completed" | json | event="cron.completed"`;
// The lane budget: no single job holds the shared bulk-ops lane for more than five minutes.
const LANE_BUDGET_MS = 5 * 60 * 1000;

export default dashboard({
  uid: 'queues-jobs',
  title: 'Queues and jobs',
  description:
    'BullMQ queues, job failures, the heartbeat, the crons and their run time against the five-minute bulk-ops lane budget.',
  tags: ['jobs'],
  uses: ['loki', 'prom'],
  from: 'now-24h',
  rows: [
    {
      title: 'Job events (logs)',
      panels: [
        {
          type: 'timeseries',
          title: 'Final job failures by job',
          targets: [loki(`sum by (jobName) (count_over_time(${JOB_FAILED} | final="true" [$__auto]))`, '{{jobName}}')],
        },
        {
          type: 'timeseries',
          title: 'All failed attempts by queue',
          targets: [loki(`sum by (queue) (count_over_time(${JOB_FAILED} [$__auto]))`, '{{queue}}')],
        },
        {
          type: 'table',
          title: 'Final failures by job and tenant (range)',
          targets: [
            loki(`sum by (jobName, queue, tenantId) (count_over_time(${JOB_FAILED} | final="true" [$__range]))`, '', {
              instant: true,
            }),
          ],
        },
        {
          type: 'table',
          title: 'Jobs with no handler: job.unknown (range)',
          targets: [
            loki(
              `sum by (jobName, queue) (count_over_time(${SEL} |= "job.unknown" | json | event="job.unknown" [$__range]))`,
              '',
              { instant: true },
            ),
          ],
        },
        {
          type: 'timeseries',
          title: 'Heartbeats per 15 min (expect 3)',
          description: 'The missing-heartbeat alert fires after 15 minutes with none: three missed beats.',
          targets: [
            loki(`sum(count_over_time(${SEL} |= "ops.heartbeat" | json | event="ops.heartbeat" [15m]))`, 'heartbeats'),
          ],
          thresholds: stepsLowBad(1, 3),
        },
        {
          type: 'timeseries',
          title: 'Cron run time (line at the five-minute lane budget)',
          description:
            'Longest run per cron. bulk-ops runs one job at a time and carries the outbox relay, the deadline sweeper and the heartbeat, so a run past the line delays all three. Split the lane rather than raise alert windows.',
          unit: 'ms',
          thresholds: steps(LANE_BUDGET_MS * 0.6, LANE_BUDGET_MS),
          targets: [loki(`max by (jobName) (max_over_time(${CRON} | unwrap durationMs [$__auto]))`, '{{jobName}}')],
        },
        {
          type: 'logs',
          title: 'Cron completions',
          w: 24,
          targets: [
            loki(
              `${CRON} | line_format "{{.jobName}} ok={{.tenantsOk}} failed={{.tenantsFailed}} in {{.durationMs}}ms"`,
            ),
          ],
          options: { showTime: true, wrapLogMessage: true, sortOrder: 'Descending' },
        },
      ],
    },
    {
      title: 'Queues (metrics)',
      panels: [
        {
          type: 'timeseries',
          title: 'Waiting jobs per queue',
          targets: [prom(`max by (queue) (app_queue_waiting{${M()}})`, '{{queue}}')],
        },
        {
          type: 'timeseries',
          title: 'Oldest waiting job age per queue',
          unit: 's',
          thresholds: steps(300, 600),
          targets: [prom(`max by (queue) (app_queue_oldest_waiting_seconds{${M()}})`, '{{queue}}')],
        },
        {
          type: 'timeseries',
          title: 'Active, delayed and failed jobs per queue',
          targets: [
            prom(`max by (queue) (app_queue_active{${M()}})`, '{{queue}} active'),
            prom(`max by (queue) (app_queue_delayed{${M()}})`, '{{queue}} delayed'),
            prom(`max by (queue) (app_queue_failed{${M()}})`, '{{queue}} failed'),
          ],
        },
        {
          type: 'timeseries',
          title: 'Final job failures per queue and job',
          targets: [
            prom(
              `sum by (queue, job_name) (increase(app_job_failed_total{${M('final="true"')}}[$__rate_interval]))`,
              '{{queue}} {{job_name}}',
            ),
          ],
        },
        {
          type: 'bargauge',
          title: 'Cron lateness: time since last success over the expected interval',
          description:
            'Above 2 means the cron missed a run (the missed-run alert). A cron with no expected-interval series (disabled, or never scheduled) is not shown.',
          thresholds: steps(1.5, 2),
          decimals: 2,
          targets: [
            prom(
              `(time() - max by (job_name) (app_cron_last_success_timestamp_seconds{${M()}})) / max by (job_name) (app_cron_expected_interval_seconds{${M()}})`,
              '{{job_name}}',
              { instant: true },
            ),
          ],
        },
        {
          type: 'timeseries',
          title: 'Outbox and deadline age (alert at 15 min)',
          unit: 's',
          thresholds: steps(300, 900),
          targets: [
            prom(`max(app_outbox_oldest_unpublished_seconds{${M()}})`, 'outbox'),
            prom(`max(app_deadline_oldest_due_seconds{${M()}})`, 'deadlines'),
          ],
        },
      ],
    },
  ],
});
