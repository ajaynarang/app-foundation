# Observability

How a product built from this template is observed in a deployed environment: where errors, logs, traces and
metrics go, and which keys switch each one on. The rules every log line and error report follows are in
[`standards/observability.md`](standards/observability.md); this page is the operator's view.

Nothing here is required to boot, test or deploy. With no key set the app runs, writes JSON logs to stdout and sends
nothing anywhere. Each vendor is switched on by its own key and is a no-op without it.

> This page grows with the observability work. Today it covers the three levels and the order to climb them, the
> AWS fallback alarms and budget (level 1), error tracking, traces, metrics, the crons and heartbeat behind them, the
> dashboards, alert rules, routing and runbooks kept as code, the deploy markers, and the local stack.

## Three levels

| Level | What is set                                     | What you get                                                                                                                                                        |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | nothing                                         | JSON logs on stdout (CloudWatch in ECS). No traces, metrics, errors or alerts. Boots clean.                                                                         |
| 1     | `alarm_email` in tfvars                         | Level 0 plus ten CloudWatch alarms and an AWS budget email (below).                                                                                                 |
| 2     | Grafana Cloud and Sentry keys, IRM webhook URLs | Logs, traces, metrics, alert rules, dashboards, error tracking and paging, plus an outside-in uptime check. The level 1 alarms are removed last, after a test-fire. |

### Going from level 1 to level 2

In this order. Each step is safe to stop after.

1. **Telemetry.** Set the Loki keys (`LOG_TRANSPORT=loki`, `LOKI_URL`, `LOKI_USERNAME`, `LOKI_PASSWORD`), the OTLP keys
   and the Sentry keys (below) in each deployed environment. Deploy. Confirm log lines arrive in Grafana with
   `env="production"` and `env="staging"`, never `development`: every rule filters on it.
2. **AWS read access and the catalog's constants.** In Grafana's CloudWatch datasource setup, read the AWS account
   Grafana assumes roles from and the external id it presents. Set them as `grafana_cloud_aws_account_id` and
   `grafana_cloud_external_id` in each environment's tfvars and apply: `grafana.tf` creates a read-only role
   (`terraform output grafana_cloudwatch_role_arn`). Add the datasource in Grafana by hand with that role and the UID
   the catalog expects (`cloudwatch`, or set `GRAFANA_CLOUDWATCH_UID`). In `catalog/constants.mjs`, check `PROJECT` and
   `REPO_URL` (`pnpm init-app` set both), set each environment's `rdsMaxConnections` to its instance class, and set
   `HAS_WORKER = false` if the product runs no worker task (`worker_desired_count = 0`). Regenerate and commit.
3. **Paging.** Create two Grafana IRM integrations (one that pages, one that notifies) and set their webhook URLs as
   secrets of the `grafana-apply` workflow, with `GRAFANA_URL` and a service-account token. Run the workflow with
   `plan`, read it, then `apply`.
4. **Test-fire.** One test page through IRM, from a laptop with the on-call webhook URL in your shell:
   `IRM_WEBHOOK_URL=<oncall url> .github/scripts/observability-markers.sh irm-alert test-fire "Test page" "Paging works" sev1`.
   Then one real rule on staging: disable the heartbeat. It runs with no
   schedule row, so first create one (nothing ships it, and `PATCH` only edits a row that exists), enabled and with
   the default interval, so it changes nothing yet:

   ```sql
   INSERT INTO job_schedules (category, job_type, schedule_type, pattern, interval_ms, is_enabled, updated_at)
   VALUES ('maintenance', 'ops-heartbeat', 'interval', NULL, 300000, true, NOW())
   ON CONFLICT (category, job_type) DO NOTHING;
   ```

   Find its id with `GET /admin/schedules`, then `PATCH /admin/schedules/:id` with `{"isEnabled": false}`: that
   removes the repeatable from BullMQ at once. Wait for `worker-heartbeat-missing` to notify, about fifteen minutes.
   Then `PATCH` it back to `{"isEnabled": true}` and leave the row: enabled with the default interval it behaves
   exactly as no row, and the next test-fire can reuse it. Do not stop the worker service for this: by default the
   API consumes every queue too (`api_queue_processors_enabled = true`), so the heartbeat keeps beating and the rule
   never fires. The rules are untested against real traffic until this step: they are written from the code, not
   tuned on a live stack.

5. **CloudWatch data.** In Grafana Explore, run each CloudWatch rule's query (RDS, Redis, the ECS services) for each
   environment and check that it returns data. Those rules treat no data as alerting, so a wrong dimension or prefix
   would page for good once they are live. The dimension sets come from the AWS metric documentation, not a live
   account.
6. **Uptime.** Add the outside-in checks (below).
7. **Only then** set `grafana_alerting_live = true` in tfvars and apply. That apply removes every level 1 alarm and
   its SNS topic; the budget stays. Terraform refuses the flag in production while either `grafana_cloud_*` value is
   empty, because Grafana could not then read the metrics the alarms watched.

### Level 1: CloudWatch alarms and the budget

The fallback for a product with no observability vendor, in `infra/terraform/alarms.tf` and `budget.tf`. Set
`alarm_email` in an environment's tfvars and apply. AWS then emails a subscription confirmation; nothing is
delivered until it is confirmed. Every alarm also emails when it recovers.

| Alarm                              | Fires when                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `<prefix>-alb-target-5xx`          | the API answered more than 10 5xx in 5 minutes                                   |
| `<prefix>-alb-elb-5xx`             | the load balancer itself answered more than 10 5xx (no healthy target, timeouts) |
| `<prefix>-alb-unhealthy-hosts`     | an API target has been unhealthy for 5 minutes                                   |
| `<prefix>-ecs-api-service-gone`    | no API task has reported CPU for 10 minutes                                      |
| `<prefix>-ecs-worker-service-gone` | the same for the worker; only while `worker_desired_count > 0`                   |
| `<prefix>-rds-cpu-high`            | RDS CPU above 80% for 10 minutes                                                 |
| `<prefix>-rds-free-storage-low`    | RDS free storage below 5 GB                                                      |
| `<prefix>-rds-freeable-memory-low` | RDS freeable memory below 40 MB for 15 minutes                                   |
| `<prefix>-rds-connections-high`    | RDS connections above `rds_connections_alarm_threshold` (default 75) for 10 min  |
| `<prefix>-redis-memory-high`       | Redis memory above 80% (with `noeviction`, writes fail at 100%)                  |

`<prefix>` is `<project>-<env>`. The service-gone alarms read the free `AWS/ECS` `CPUUtilization` metric, which stops
arriving when no task runs, and treat missing data as breaching. Set `rds_connections_alarm_threshold` to 75% of
your instance class's `max_connections`, the same share the catalog's `rdsMaxConnections` uses. If you enable
staging's night shutoff (`scheduler.tf`, shipped disabled), leave `alarm_email` empty for staging, or the
service-gone alarms fire every night.

The budget emails the same address at 80% of the month's actual cost and when the month is forecast to pass 100%
of `monthly_budget_usd` (default 100). An AWS cost budget measures the whole account, not one stack: when staging
and production share an account, set `monthly_budget_usd = 0` in one of them. The budget stays when
`grafana_alerting_live` removes the alarms, because Grafana does not watch the bill.

Container Insights is off by default (`container_insights = false`): nothing here needs it, and it is billed per
metric. A CI apply runs as the deploy role, which may refresh and remove these alarms but not create the SNS topic
or its subscription, so the first apply with `alarm_email` set runs with admin credentials.

### Uptime, outside-in

The Grafana rules see what the backend writes and measures. They cannot see "no healthy target" or a load balancer
answering 502, 503 or 504. Level 2 therefore includes two HTTP checks from outside AWS, paging the on-call IRM
integration: `GET <api>/api/v1/health/live` and `GET <web>/`. Grafana Synthetic Monitoring does this in the same
stack; a separate uptime service (Better Stack and others) works too and sends its pages to the same IRM integration.
Neither is kept as code here.

## Error tracking (Sentry)

Errors only: no tracing, no session replay, no personal data. The backend (API and worker) and the web report to the
same Sentry organisation, and both name the environment with the same three values the Loki `env` label uses
(`production`, `staging`, `development`), so one filter covers logs and errors.

### Keys

| Key                                                 | Where            | What it does                                                                                                    |
| --------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`                                        | backend          | Switches backend error tracking on. Unset: `Sentry.init` never runs and every report returns at once.           |
| `SENTRY_RELEASE`                                    | backend          | The release on every backend event: the image's git SHA (`BUILD_SHA`). Set by the image; never in Doppler.      |
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
Redis, the scheduler and a consumer all work, so its absence is the signal. It needs no schedule row and none
ships; a row `('maintenance', 'ops-heartbeat')` an operator inserts is honoured, and disabling it removes the beat,
which is how a test-fire proves the missing-heartbeat alert pages on a stack with no worker to stop (step 4 above).

## Dashboards, alert rules and routing (Grafana as code)

Dashboards, alert rules, routing and runbooks live in the repo, the first three under
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
- **Boards:** overview, queues and jobs, SLOs, per-tenant health. Each has an environment selector offering the two
  deployed environments, production and staging (the same `env` label the logs, metrics and errors carry).
- **Rules:** a starter catalog of 23, one signal each, live from the first apply, the same in both environments:
  API errors, availability burn and latency; final job failures, unknown jobs, the heartbeat, stalled queues, the
  outbox backlog, late deadlines, missed crons and crons with failed tenants; outbound and sign-in code failures; the
  AI error ratio; and the AWS side (RDS, Redis, ECS services). The full list, with thresholds and the reasons for
  them, is in the catalog's README.
- **Runbooks:** [`docs/runbooks/`](runbooks/README.md), one file per family and one section per rule (what it means,
  the first three checks, mitigation, escalation). Every notification links to its section. `check:ops` fails on a
  rule with no section and on a section with no rule.
- **Routing:** a `sev1` in production pages through the `irm-oncall` contact point; everything else, a staging
  `sev1` included, notifies through `irm-notify`. Both are Grafana IRM webhooks.
- **Applying** is a dry run unless `--apply` is passed. `--apply` needs `GRAFANA_URL`, `GRAFANA_SA_TOKEN` and, for
  contact points, policies or rules, `IRM_ONCALL_WEBHOOK_URL` (apply-time secrets, never app config or Doppler), and refuses while `REPO_URL` is the
  placeholder, while a generated file is stale, or (for rules) before Loki has seen logs from both environments.
  The manual workflow `grafana-apply.yml` (`plan`, `apply`, `cardinality`) runs it with those secrets; it has no
  push trigger and never will.

## Deploy markers

`.github/scripts/observability-markers.sh` records each deploy where people look when something changes:

| Command              | What it does                                                                      | Needs                                                                   |
| -------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `sentry-release`     | a Sentry release named by the git SHA, its commits, and a deploy record for `env` | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` secrets; `SENTRY_PROJECT_BACKEND` var |
| `grafana-annotation` | a deploy line on the Grafana boards, tagged `deploy`, `env:<env>`, `service:<x>`  | `GRAFANA_URL` var, `GRAFANA_SA_TOKEN` secret                            |
| `irm-alert`          | one alert through a Grafana IRM webhook (the level 2 test page)                   | `IRM_WEBHOOK_URL`                                                       |

`deploy-all.yml` runs `sentry-release` and a backend annotation after each backend deploy is healthy, and a web
annotation when it triggers the web build; `deploy-frontend.yml` adds the web annotation. Each command is a clean
no-op while its values are unset, and a vendor error is a warning, never a failed deploy. The GitHub values are
repository secrets and variables, not Doppler keys. The backend image is built with `--build-arg BUILD_SHA=<sha>`,
which the Dockerfile turns into `SENTRY_RELEASE`, so a backend error names the same release the marker created. The
web's release comes from its own build (`next.config.ts`). The script's hermetic test runs in `pnpm check:ops` and in
the deploy workflow's first job, so every deploy proves it works.

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
