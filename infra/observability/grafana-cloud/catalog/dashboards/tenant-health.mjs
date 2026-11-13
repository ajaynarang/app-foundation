import { LEVEL } from '../constants.mjs';
import { ERR, M, SEL, TENANT_VAR, dashboard, loki, prom } from './kit.mjs';

// Logger contexts (`new Logger(X.name)`) behind each family. validate.mjs fails if one names no class in the code.
const OUTBOUND_CONTEXTS = [
  'EmailService',
  'SmsService',
  'TwilioVerifyService',
  'FcmService',
  'PushService',
  'WhatsAppSendHandler',
  'WebhookDeliveryProcessor',
];
const AI_CONTEXTS = ['AssistantAiService', 'AiTelemetryService', 'AiRouteResolver', 'GuardrailsService'];
const anyOf = (contexts) => contexts.join('|');

// The line filter on the id first keeps the scan cheap; the json matcher makes it exact.
const T = `${SEL} |= "$tenant" | json | tenantId="$tenant"`;
const errorsIn = (contexts) => `${T} | ${ERR} | context=~"${anyOf(contexts)}"`;

export default dashboard({
  uid: 'tenant-health',
  title: 'Per-tenant health',
  description:
    'Everything about one tenant: errors, failed jobs, outbound sends and AI. Enter the tenantId from the alert in the Tenant ID box.',
  tags: ['tenant'],
  uses: ['loki', 'prom'],
  from: 'now-24h',
  extraVars: [TENANT_VAR],
  rows: [
    {
      title: 'Which tenants are hurting (all tenants)',
      panels: [
        {
          type: 'table',
          title: 'Error lines by tenant (range)',
          targets: [
            loki(
              `topk(20, sum by (tenantId) (count_over_time(${SEL} | json | ${ERR} | tenantId!="" [$__range])))`,
              '',
              { instant: true },
            ),
          ],
        },
        {
          type: 'table',
          title: 'Final job failures by tenant (range)',
          targets: [
            loki(
              `topk(20, sum by (tenantId) (count_over_time(${SEL} |= "job.failed" | json | event="job.failed" | final="true" [$__range])))`,
              '',
              { instant: true },
            ),
          ],
        },
      ],
    },
    {
      title: 'Selected tenant',
      panels: [
        {
          type: 'timeseries',
          title: 'Errors by context',
          targets: [loki(`sum by (context) (count_over_time(${T} | ${ERR} [$__auto]))`, '{{context}}')],
        },
        {
          type: 'timeseries',
          title: 'Final job failures by job',
          targets: [
            loki(
              `sum by (jobName) (count_over_time(${T} | event="job.failed" | final="true" [$__auto]))`,
              '{{jobName}}',
            ),
          ],
        },
        {
          type: 'timeseries',
          title: 'Outbound send errors',
          w: 8,
          targets: [
            loki(`sum by (context) (count_over_time(${errorsIn(OUTBOUND_CONTEXTS)} [$__auto]))`, '{{context}}'),
          ],
        },
        {
          type: 'timeseries',
          title: 'AI errors',
          w: 8,
          targets: [loki(`sum by (context) (count_over_time(${errorsIn(AI_CONTEXTS)} [$__auto]))`, '{{context}}')],
        },
        {
          type: 'timeseries',
          title: 'AI invocations by surface and status',
          w: 8,
          targets: [
            prom(
              `sum by (surface, status) (increase(app_ai_invocation_total{${M('tenant="$tenant"')}}[$__rate_interval]))`,
              '{{surface}} {{status}}',
            ),
          ],
        },
        {
          type: 'timeseries',
          title: 'Job failures (metric)',
          targets: [
            prom(
              `sum by (job_name) (increase(app_job_failed_total{${M('tenant="$tenant"')}}[$__rate_interval]))`,
              '{{job_name}}',
            ),
          ],
        },
        {
          type: 'timeseries',
          title: 'AI spend (USD) by surface',
          unit: 'currencyUSD',
          targets: [
            prom(
              `sum by (surface) (increase(app_ai_invocation_cost_usd_total{${M('tenant="$tenant"')}}[$__rate_interval]))`,
              '{{surface}}',
            ),
          ],
        },
        {
          type: 'logs',
          title: 'Warnings and errors for this tenant',
          w: 24,
          h: 12,
          targets: [loki(`${T} | ${LEVEL.warnOrError}`)],
          options: { showTime: true, wrapLogMessage: true, sortOrder: 'Descending', enableLogDetails: true },
        },
      ],
    },
  ],
});
