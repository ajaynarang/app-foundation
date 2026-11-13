# Observability

How a product built from this template is observed in a deployed environment: where errors, logs, traces and
metrics go, and which keys switch each one on. The rules every log line and error report follows are in
[`standards/observability.md`](standards/observability.md); this page is the operator's view.

Nothing here is required to boot, test or deploy. With no key set the app runs, writes JSON logs to stdout and sends
nothing anywhere. Each vendor is switched on by its own key and is a no-op without it.

> This page grows with the observability work. Today it covers error tracking, traces, metrics, the crons and
> heartbeat behind them, the dashboards and alert routing kept as code, and the local stack. The alert rules, their
> runbooks and the AWS fallback alarms are added to it as they land.

## Error tracking (Sentry)

Errors only: no tracing, no session replay, no personal data. The backend (API and worker) and the web report to the
same Sentry organisation, and both name the environment with the same three values the Loki `env` label uses
(`production`, `staging`, `development`), so one filter covers logs and errors.

### Keys

| Key                                                 | Where            | What it does                                                                                                    |
| --------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`                                        | backend          | Switches backend error tracking on. Unset: `Sentry.init` never runs and every report returns at once.           |
| `SENTRY_RELEASE`                                    | backend          | The release on every backend event: the deployed git SHA.                                                       |
| `ENV_TYPE`                                          | backend          | Already required. `production` → `production`; `sandbox`, `preprod` → `staging`; `development` → `development`. |
| `NEXT_PUBLIC_SENTRY_DSN`                            | web (build time) | Switches web error tracking on, and adds the DSN's origin to the CSP `connect-src`. Unset: the CSP names none.  |
| `NEXT_PUBLIC_APP_ENV`                               | web (build time) | `production`, `staging` or `development` (default). With `staging` the web shows a caution stripe at the top.   |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | web build        | Source-map upload and release creation. Only when all three are set; the maps are deleted from the output.      |

`NEXT_PUBLIC_*` values are inlined at build time: a change needs a rebuild, not a restart. Sentry stores error data
outside AWS, so a product that sets these keys lists Sentry as a subprocessor in its privacy terms.

### What reaches Sentry

| Source     | Reported by                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http`     | Every 5xx answer, once, where its body is written (`writeErrorEnvelope`; `OAuthErrorFilter` on the OAuth protocol routes), and a 5xx a streaming route ends with. |
| `job`      | A queue job's final failure (`reportJobFailure`). A retry BullMQ will run again is not reported.                                                                  |
| `cron`     | Each tenant a scheduled sweep fails for (`CronRun.failed`).                                                                                                       |
| `event`    | A domain event that could not be queued for its durable path, or not written to the event log.                                                                    |
| `workflow` | A durable workflow function that used up its retries.                                                                                                             |
| `ai`       | A provider refusing a platform-paid AI call for credit (not a 5xx, so nothing else reports it).                                                                   |

A reused refresh token (a possible stolen session) is reported at warning level. A 4xx is never reported; a line
logged at error level is not reported either, because the tracker does not read logs. The SDK's own Nest
integration is switched off, because it would report every failed job attempt and every throwing `@OnEvent` handler
on its own, untagged (`sentry-auto-capture.spec.ts`).

Every event is tagged with ids only, from the request or job it ran in: `tenantId` (the public id), `tenantDbId`,
`role`, `jobName`, `jobId`, `queue`, `requestId`, `traceId`. A web event from a failed API call carries the
backend's `requestId` (read from the `x-request-id` response header), so the event leads to the request's log lines.
The web drops a 4xx `ApiError`, chunk-load failures after a deploy, aborted requests and console breadcrumbs.

### Turning it on

1. Create one Sentry project for the backend and one for the web (or one for both).
2. Set `SENTRY_DSN` in each backend environment, and `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_APP_ENV` in each web
   build. Deploy.
3. Check: a deliberate 500 on staging appears in Sentry with `environment: staging` and a `requestId` tag that finds
   the request's log lines.

## Traces and metrics (OTLP)

Both go out over OTLP/HTTP to one endpoint with one auth header, so one pair of keys turns both on. Pushed, not
scraped: the worker has no HTTP port.

### Keys

| Key                                   | Where   | What it does                                                                                                                                                   |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | backend | The OTLP base URL; traces go to `<url>/v1/traces`, metrics to `<url>/v1/metrics`. Unset: nothing is exported, except with `ENV_TYPE=development` (below).      |
| `OTEL_EXPORTER_OTLP_HEADERS`          | backend | `key=value` pairs, values URL-encoded. A hosted backend's auth: `Authorization=Basic%20<base64>`.                                                              |
| `OTEL_TRACES_SAMPLER_ARG`             | backend | Root-span sampling ratio, 0 to 1. Default 1 (every trace). Parent-based: a request that arrives sampled stays sampled.                                         |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | backend | A full metrics URL that replaces `<url>/v1/metrics`. Used locally to send metrics to Prometheus while traces go to Tempo. It never turns metrics on by itself. |
| `OTEL_SERVICE_NAME`                   | backend | The `service` label (default `app-backend`). Products sharing one backend are told apart by it.                                                                |
| `METRICS_TENANT_LABEL_MAX`            | backend | Distinct tenants one process gives their own `tenant` label before the rest read `other` (default 200).                                                        |
| `OPS_GAUGES_FROM_API`                 | API     | Set by Terraform only, when `worker_desired_count = 0` (below). Never set it in Doppler: Doppler values override the task environment.                         |

With no endpoint and `ENV_TYPE` anything but `development`, the SDK starts with no exporter and no instrumentation:
it only carries the trace context, so AI spans still nest in Langfuse, and every metric call is a no-op. Nothing
retries into the void. With `ENV_TYPE=development` and no endpoint, traces go to Tempo on `http://localhost:4318` and
metrics to Prometheus's OTLP receiver on `http://localhost:9090/api/v1/otlp/v1/metrics` (the local stack; Tempo takes
no metrics). Every exported span and point carries `deployment.environment` / `env` from `ENV_TYPE` (the same
three values as logs and errors) and a stable `service.instance.id` (the ECS task id).

AI spans sent to Langfuse (`LANGFUSE_SECRET_KEY`) have phones and emails masked before they leave the process, on
both paths: AI SDK calls go through their own provider, whose span processor masks every string attribute, event
attribute and status message; Mastra agent spans (the chat assistant) go through Mastra's exporter, with a span
output processor that masks input, output, attributes, metadata and error.

Traces and metrics leave AWS when the endpoint is a hosted backend: list it as a subprocessor in your privacy terms.

### What is measured

Every instrument is created in one file, `packages/appshore/kernel/src/infrastructure/telemetry/metrics.ts`, which
holds the label budget. Prometheus names gain `_total` on counters and `_seconds` on second-valued instruments.

| Metric                                                                           | Labels                                    | Recorded by                                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `app_job_failed`                                                                 | `queue`, `job_name`, `final`, `tenant`    | Every failed job attempt (`reportJobFailure`).                                 |
| `app_cron_last_success_timestamp_seconds`                                        | `job_name`                                | `CronRun.complete()`, unless every tenant failed.                              |
| `app_cron_expected_interval_seconds`                                             | `job_name`                                | The queue reporter, from the repeatables BullMQ holds (a minute or more only). |
| `app_queue_waiting`, `_active`, `_failed`, `_delayed`, `_oldest_waiting_seconds` | `queue`                                   | The queue reporter, every export.                                              |
| `app_outbox_oldest_unpublished_seconds`                                          | none                                      | Every 30 s: the oldest committed, unpublished outbox event; 0 when none waits. |
| `app_deadline_oldest_due_seconds`                                                | none                                      | Every 30 s: how far past due the oldest pending deadline is; 0 when none is.   |
| `app_otp_failed`                                                                 | `reason`                                  | A sign-in code send or check failing (`provider`, `invalid`, `rate_limited`).  |
| `app_outbound_failed`                                                            | `channel`                                 | A failed email, SMS, push, WhatsApp or webhook send.                           |
| `app_ai_invocation`, `app_ai_invocation_cost_usd`                                | `surface`, `status` / `surface`, `tenant` | The AI cost ledger write, once per new row.                                    |
| `app_ai_invocation_duration`                                                     | `surface`, `status`                       | The same write.                                                                |
| `http.server.request.duration`                                                   | route, method, status                     | The HTTP auto-instrumentation (stable semantic conventions).                   |

`tenant` is the tenant's public id, the same `tenantId` a log line carries. No metric carries a user, request or job
id, a phone, an email, an amount, or an AI provider, route or model. Three auto-instrumented histograms nobody reads
(`http.client.request.duration`, `db.client.operation.duration`, `v8js.gc.duration`) are dropped at the source.

### Which process reports the ops gauges

The queue depths, the cron intervals and the outbox and deadline ages are read from Redis and Postgres, so exactly
one process role reports them: the worker. With no worker task (`worker_desired_count = 0`) the API consumes every
queue, and Terraform sets `OPS_GAUGES_FROM_API=true` on the API task so the gauges still exist. Several reporting
tasks report the same readings, so every rule and panel on these gauges uses `max`, never `sum`.

## Crons and the heartbeat

The foundation's crons run on the `bulk-ops` queue, one job at a time, from rows in `job_schedules` an admin can
retune or disable on the Schedules screen. Defaults (UTC, daily, staggered):

| Job                             | When  | What it does                                                                      |
| ------------------------------- | ----- | --------------------------------------------------------------------------------- |
| `trial-expiry`                  | 00:15 | Moves tenants whose trial ended to `TRIAL_EXPIRED`.                               |
| `job-cleanup`                   | 03:00 | Deletes finished job records older than 90 days.                                  |
| `data-retention`                | 04:00 | Deletes old login events, webhook logs, job rows, event logs and HITL challenges. |
| `login-events-cleanup`          | 04:30 | Deletes login events older than 90 days.                                          |
| `tokens-cleanup`                | 05:00 | Deletes expired refresh tokens and ones revoked over 30 days ago.                 |
| `cleanup` (notifications queue) | 05:30 | Deletes old read and dismissed in-app notifications.                              |

Every repeatable of a minute or more runs inside `CronRun`, which writes one `cron.completed` line with its duration
and tenant counts and stamps `app_cron_last_success_timestamp_seconds` (`cron-run-coverage.spec.ts` holds this). The
queue reporter publishes each one's expected interval from what BullMQ holds, so a disabled schedule has no series
and the one missed-run rule stays silent for it. The outbox relay (every 10 s) and the deadline sweeper (every 30 s)
are left out on purpose; their two age gauges cover them.

`ops-heartbeat` runs every five minutes on `bulk-ops` and writes one `ops.heartbeat` line. The line exists only if
Redis, the scheduler and a consumer all work, so its absence is the signal. It needs no schedule row; a disabled
row `('maintenance', 'ops-heartbeat')` removes it, which is how a test-fire proves the missing-heartbeat alert pages
on a stack with no worker to stop.

## Dashboards and alert routing (Grafana as code)

Dashboards, alert routing and (as they land) alert rules live in the repo, under
[`infra/observability/grafana-cloud/`](../infra/observability/grafana-cloud/README.md), and are applied to a hosted
Grafana stack by `grafana-apply.mjs`. Nothing is created in Grafana by hand except the datasources and the IRM
integrations.

- **The source is `catalog/`.** `alerting/` and `dashboards/` are generated from it by `generate.mjs`; never edit
  them by hand. `pnpm check:ops` (in `pnpm verify`, and on the pre-push hook for a push that touches `infra/`,
  `docs/runbooks/`, `.github/` or `tools/`) fails when they are stale, and runs `validate.mjs` over every query.
- **Product constants.** `PROJECT` (the Terraform `project` value) and `REPO_URL` in `catalog/constants.mjs`; every
  service name, AWS name and runbook link derives from them. `pnpm init-app` sets both and regenerates. A product
  with no worker task (`worker_desired_count = 0`) sets `HAS_WORKER = false` there and regenerates, so nothing
  selects on a service that sends no metric.
- **Boards:** overview, queues and jobs, SLOs, per-tenant health. Each has an environment selector; the `env` values
  are the same three the logs, metrics and errors carry.
- **Routing:** a `sev1` in production pages through the `irm-oncall` contact point; everything else, a staging
  `sev1` included, notifies through `irm-notify`. Both are Grafana IRM webhooks.
- **Applying** is a dry run unless `--apply` is passed. `--apply` needs `GRAFANA_URL`, `GRAFANA_SA_TOKEN` and
  `IRM_ONCALL_WEBHOOK_URL` (apply-time secrets, never app config or Doppler), and refuses while `REPO_URL` is the
  placeholder, while a generated file is stale, or (for rules) before Loki has seen logs from both environments.

## The local stack

For trying logs, traces, metrics and PromQL on a laptop, not for production:

```bash
docker compose --profile observability up -d   # Loki :3100, Tempo :4318, Prometheus :9090, Grafana :3003
```

Every port is bound to loopback. With `ENV_TYPE=development` and no endpoint set, the backend sends traces to Tempo
and metrics to Prometheus's OTLP receiver on its own. If you set `OTEL_EXPORTER_OTLP_ENDPOINT` to a local collector,
also set `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:9090/api/v1/otlp/v1/metrics` to keep metrics on
Prometheus. Set `LOG_TRANSPORT=loki` for logs. Grafana has the three datasources provisioned. A deployed product
sends to a hosted backend instead, switched on by the keys above.
