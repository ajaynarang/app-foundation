import { ENVS, HAS_WORKER } from '../constants.mjs';
import { AWS, ERR, M, SEL, cw, dashboard, loki, prom, steps, stepsLowBad } from './kit.mjs';

const HTTP = 'http_server_request_duration_seconds';
const RDS = { DBInstanceIdentifier: AWS.rds };
const ECS = (role) => ({ ClusterName: AWS.cluster, ServiceName: AWS.service(role) });
const ROLES = HAS_WORKER ? ['api', 'worker'] : ['api'];
const GB = 1024 * 1024 * 1024;
// Thresholds are per board, not per environment; the smallest database sets them.
const MAX_CONNECTIONS = Math.min(...ENVS.map((e) => e.rdsMaxConnections));

// The one line a 5xx writes: `<METHOD> <path> - Status: <code> <CODE> - <detail>` from HttpExceptionFilter.
const API_5XX = `${SEL} |= "Status: 5" | json | context="HttpExceptionFilter" | msg=~".*Status: 5[0-9][0-9].*"`;

export default dashboard({
  uid: 'overview',
  title: 'Overview',
  description:
    'Golden signals from logs and metrics, plus the AWS infrastructure. The first board to open in an incident.',
  tags: ['overview'],
  uses: ['loki', 'prom', 'cloudwatch'],
  rows: [
    {
      title: 'Golden signals: logs',
      panels: [
        {
          type: 'stat',
          title: 'API 5xx (range)',
          w: 6,
          h: 5,
          targets: [loki(`sum(count_over_time(${API_5XX} [$__range]))`, '', { instant: true })],
          thresholds: steps(1, 5),
        },
        {
          type: 'stat',
          title: 'Error lines (range)',
          w: 6,
          h: 5,
          targets: [loki(`sum(count_over_time(${SEL} | json | ${ERR} [$__range]))`, '', { instant: true })],
          thresholds: steps(10, 50),
        },
        {
          type: 'stat',
          title: 'Heartbeats (last 15 min)',
          description:
            'ops.heartbeat runs every 5 minutes on bulk-ops. 0 means Redis, the scheduler or the consumer is down.',
          w: 6,
          h: 5,
          targets: [
            loki(`sum(count_over_time(${SEL} |= "ops.heartbeat" | json | event="ops.heartbeat" [15m]))`, '', {
              instant: true,
            }),
          ],
          thresholds: stepsLowBad(1, 2),
        },
        {
          type: 'stat',
          title: 'Final job failures (range)',
          w: 6,
          h: 5,
          targets: [
            loki(
              `sum(count_over_time(${SEL} |= "job.failed" | json | event="job.failed" | final="true" [$__range]))`,
              '',
              { instant: true },
            ),
          ],
          thresholds: steps(1, 5),
        },
        {
          type: 'timeseries',
          title: 'API 5xx',
          targets: [loki(`sum(count_over_time(${API_5XX} [$__auto]))`, '5xx')],
        },
        {
          type: 'table',
          title: 'Top error contexts (range)',
          targets: [
            loki(`topk(15, sum by (context) (count_over_time(${SEL} | json | ${ERR} [$__range])))`, '{{context}}', {
              instant: true,
            }),
          ],
        },
      ],
    },
    {
      title: 'Golden signals: metrics',
      panels: [
        {
          type: 'timeseries',
          title: 'API request rate',
          w: 8,
          unit: 'reqps',
          targets: [prom(`sum(rate(${HTTP}_count{${M()}}[$__rate_interval]))`, 'requests/s')],
        },
        {
          type: 'timeseries',
          title: 'API 5xx share of non-4xx requests',
          w: 8,
          unit: 'percentunit',
          thresholds: steps(0.005, 0.05),
          targets: [
            prom(
              `sum(rate(${HTTP}_count{${M('http_response_status_code=~"5.."')}}[$__rate_interval])) / sum(rate(${HTTP}_count{${M('http_response_status_code!~"4.."')}}[$__rate_interval]))`,
              '5xx share',
            ),
          ],
        },
        {
          type: 'timeseries',
          title: 'API latency p50 / p95',
          w: 8,
          unit: 's',
          thresholds: steps(0.5, 1),
          targets: [
            prom(`histogram_quantile(0.5, sum by (le) (rate(${HTTP}_bucket{${M()}}[$__rate_interval])))`, 'p50'),
            prom(`histogram_quantile(0.95, sum by (le) (rate(${HTTP}_bucket{${M()}}[$__rate_interval])))`, 'p95'),
          ],
        },
        {
          type: 'timeseries',
          title: 'Jobs waiting per queue',
          w: 8,
          targets: [prom(`max by (queue) (app_queue_waiting{${M()}})`, '{{queue}}')],
        },
        {
          type: 'timeseries',
          title: 'Job failures per queue',
          w: 8,
          targets: [prom(`sum by (queue) (increase(app_job_failed_total{${M()}}[$__rate_interval]))`, '{{queue}}')],
        },
        {
          type: 'timeseries',
          title: 'Outbox and deadline age',
          description: 'Oldest unpublished outbox event and most overdue deadline. Both alert at 15 minutes.',
          w: 8,
          unit: 's',
          thresholds: steps(300, 900),
          targets: [
            prom(`max(app_outbox_oldest_unpublished_seconds{${M()}})`, 'outbox'),
            prom(`max(app_deadline_oldest_due_seconds{${M()}})`, 'deadlines'),
          ],
        },
      ],
    },
    {
      title: 'Infrastructure (CloudWatch basic metrics)',
      panels: [
        {
          type: 'timeseries',
          title: 'RDS CPU',
          w: 8,
          unit: 'percent',
          thresholds: steps(60, 80),
          targets: [cw('AWS/RDS', 'CPUUtilization', 'Average', RDS, 'cpu')],
        },
        {
          type: 'timeseries',
          title: 'RDS connections',
          description: `Lines at 60% and 75% of max_connections (${MAX_CONNECTIONS}, rdsMaxConnections in constants.mjs).`,
          w: 8,
          thresholds: steps(Math.round(MAX_CONNECTIONS * 0.6), Math.round(MAX_CONNECTIONS * 0.75)),
          targets: [cw('AWS/RDS', 'DatabaseConnections', 'Maximum', RDS, 'connections')],
        },
        {
          type: 'timeseries',
          title: 'RDS free storage',
          w: 8,
          unit: 'bytes',
          thresholds: stepsLowBad(2 * GB, 4 * GB),
          targets: [cw('AWS/RDS', 'FreeStorageSpace', 'Minimum', RDS, 'free')],
        },
        {
          type: 'timeseries',
          title: 'RDS freeable memory and swap',
          w: 8,
          unit: 'bytes',
          targets: [
            cw('AWS/RDS', 'FreeableMemory', 'Minimum', RDS, 'freeable'),
            cw('AWS/RDS', 'SwapUsage', 'Maximum', RDS, 'swap'),
          ],
        },
        {
          type: 'timeseries',
          title: 'Redis memory used',
          w: 8,
          unit: 'percent',
          thresholds: steps(70, 80),
          targets: [
            cw('AWS/ElastiCache', 'DatabaseMemoryUsagePercentage', 'Maximum', { CacheClusterId: AWS.redis }, 'memory'),
          ],
        },
        {
          type: 'timeseries',
          title: 'ECS CPU per service (no line means no task)',
          w: 8,
          unit: 'percent',
          targets: ROLES.map((role) => cw('AWS/ECS', 'CPUUtilization', 'Average', ECS(role), role)),
        },
        {
          type: 'timeseries',
          title: 'ECS memory per service',
          w: 8,
          unit: 'percent',
          targets: ROLES.map((role) => cw('AWS/ECS', 'MemoryUtilization', 'Average', ECS(role), role)),
        },
      ],
    },
  ],
});
