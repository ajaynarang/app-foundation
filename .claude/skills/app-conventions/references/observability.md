---
owner: foundation
sources:
  - docs/standards/observability.md
  - docs/observability.md
  - docs/runbooks/README.md
  - packages/appshore/kernel/src/infrastructure/logging/request-context.middleware.ts#requestContextStorage
  - packages/appshore/kernel/src/infrastructure/logging/log-context-mixin.ts#logContextMixin
  - packages/appshore/kernel/src/infrastructure/logging/job-log-context.ts#withJobContext
  - packages/appshore/kernel/src/infrastructure/queue/job-events.ts#CronRun
  - packages/appshore/kernel/src/infrastructure/queue/job-events.ts#toLoggableError
  - packages/appshore/kernel/src/infrastructure/queue/job-events.ts#reportJobFailure
  - packages/appshore/kernel/src/infrastructure/queue/job-events.ts#JOB_EVENTS
  - packages/appshore/kernel/src/infrastructure/queue/job-envelope.helper.ts#buildJobEnvelope
  - packages/appshore/kernel/src/infrastructure/error-tracking/sentry.ts#reportError
  - packages/appshore/kernel/src/infrastructure/error-tracking/sentry.ts#ERROR_SOURCE
  - packages/appshore/kernel/src/infrastructure/telemetry/metrics.ts#recordOutboundFailed
  - packages/appshore/kernel/src/infrastructure/telemetry/metrics.ts#toTenantLabel
  - packages/appshore/kernel/src/shared/utils/log-redaction.ts#maskEmail
  - packages/appshore/web-core/src/shared/lib/sentry.ts#captureError
  - packages/appshore/platform/src/auth/tokens-cleanup.processor.ts#TokensCleanupJobHandler
  - infra/observability/grafana-cloud/catalog/alert-rules.mjs
  - infra/observability/grafana-cloud/catalog/constants.mjs
  - infra/terraform/alarms.tf
guards:
  - log-hygiene.spec.ts
  - log-context-mixin.spec.ts
  - request-context.middleware.spec.ts
  - job-envelope.helper.spec.ts
  - job-events.spec.ts
  - cron-run-coverage.spec.ts
  - error-envelope.spec.ts
  - sentry.spec.ts
  - sentry-auto-capture.spec.ts
  - sentry-options.test.ts
  - metrics.spec.ts
  - pii-masking-langfuse-span-processor.spec.ts
  - pii-masking-span-output-processor.spec.ts
  - script:check:ops
examples:
  - InvoiceSyncService
  - InvoiceSweepJobHandler
  - invoice-sweep
  - invoice-sync-failed
  - recordInvoiceSyncFailed
  - invoiceSyncFailed
---

# Observability: logs, errors, metrics, traces, alerts

The standard every log line, metric, trace and error report follows is `docs/standards/observability.md`; this file
does not restate it, it says how to follow it. How an operator turns each vendor on, and the full metric and alert
lists, are in `docs/observability.md`. The decision behind both is the ADR "Observability: open protocols, Grafana
Cloud and Sentry pre-wired and off without keys, CloudWatch alarms as the fallback",
`docs/adr/0018-observability-open-protocols.md`.

**The production default.** Everything is pre-wired and off until its key is set, so a fresh product boots, tests and
deploys with nothing. Three levels:

| Level | Set                                          | You get                                                                            |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0     | nothing                                      | JSON logs on stdout (CloudWatch in ECS). Nothing leaves the process.               |
| 1     | `alarm_email` in tfvars                      | Ten CloudWatch alarms and an AWS budget email (`infra/terraform/alarms.tf`).       |
| 2     | Loki, OTLP and Sentry keys; Grafana IRM URLs | Grafana Cloud logs, traces, metrics, the alert catalog and dashboards, and Sentry. |

Logs go out as pino JSON (and to Loki with `LOG_TRANSPORT=loki`), traces and metrics over OTLP/HTTP, errors to
Sentry. Each is an open protocol, so a product can point it at another vendor by changing keys, not code.

## Rules

### Logs

- A logger is `new Logger(ClassName.name)`; alert rules match on that context, and `validate.mjs` checks every context
  a rule names exists in code. Never `console.*` in `src` outside the standard's allow-list.
  [guard: log-hygiene.spec.ts, script:check:ops]
- Context comes from the mixin, never by hand: inside a request every line carries `requestId`, `traceId` and, once
  auth has run, the tenant, user and role; inside a job, `jobName` and `jobId`; in both, the `rls.*` tenant context.
  The one exception is a BullMQ `failed` listener, which runs outside the job: call `reportJobFailure`.
  [guard: log-context-mixin.spec.ts, job-events.spec.ts]
- A caller may send its own `x-request-id` only as a UUID; anything else is replaced, and the id is echoed in the
  response so a client's bug report finds its lines. [guard: request-context.middleware.spec.ts]
- A job enqueued from a request carries the request's id: wrap the payload with `buildJobEnvelope`, which takes
  `correlationId` from the request context. Never build a `JobEnvelope` by hand. [guard: job-envelope.helper.spec.ts]
- An error is logged as an `err` field built by `toLoggableError`, never flattened into `msg` and never the raw
  object (an HTTP-client error carries its request headers). [guard: job-events.spec.ts]
- No phone, email, name, token, code, message body, amount or URL with a query string in a line; use `maskEmail`,
  `maskPhone`, `stripQueryString`, `scrubContactDetails`. [guard: log-hygiene.spec.ts]
- A structured `event` value an alert keys on is a constant (`JOB_EVENTS`, or a sibling constants file), never a
  literal at the call site. [review-only: the spec reads interpolations, not event names]
- Only `service` and `env` are Loki labels from code; tenant, request and job ids stay in the JSON body.
  [review-only: the transport config is read, not scanned]
- The environment name comes from `ENV_TYPE`; `NODE_ENV` is for build and test mode only.
  [guard: log-hygiene.spec.ts]

### Errors

- A 5xx is reported where its body is written (`writeErrorEnvelope`, `OAuthErrorFilter`); a 4xx never.
  [guard: error-envelope.spec.ts]
- Every other error is reported with `reportError` and a `source` from `ERROR_SOURCE`: a final job failure through
  `reportJobFailure`, a cron tenant through `CronRun`'s `failed`. A line logged at error level reports nothing.
  [guard: job-events.spec.ts]
- Nothing else calls the Sentry SDK, `@sentry/` is imported only under an `error-tracking/` folder, and the SDK's
  own Nest integration stays off. [guard: log-hygiene.spec.ts, sentry-auto-capture.spec.ts]
- A report carries ids only (`tenantId`, `tenantDbId`, `role`, `jobName`, `jobId`, `queue`, `requestId`,
  `traceId`); bodies, headers, cookies, query strings and model inputs are never collected.
  [guard: sentry.spec.ts, sentry-options.test.ts]
- On the web, `captureError` reports; a 4xx `ApiError`, a chunk-load failure after a deploy and an aborted request are
  dropped. [guard: sentry-options.test.ts]

### Metrics and traces

- Every instrument is created in `packages/appshore/kernel/src/infrastructure/telemetry/metrics.ts`, behind a
  `record*` function; a caller never touches the meter. [guard: log-hygiene.spec.ts]
- Labels are constants, or values normalised in that file into a closed set; never a user id, request id, job id,
  phone, email or amount. `tenant` (through `toTenantLabel`) only on the three instruments the standard names.
  [guard: log-hygiene.spec.ts, metrics.spec.ts]
- A gauge read from Redis or Postgres is reported by one process role, and every rule and panel on it uses `max`,
  never `sum`. [guard: script:check:ops]
- Model calls are traced to Langfuse only through the two masked paths; a new path needs its own mask.
  [guard: pii-masking-langfuse-span-processor.spec.ts, pii-masking-span-output-processor.spec.ts]

### Crons and alerts

- Every repeatable of a minute or more runs inside `CronRun` and calls `complete()` once, so the missed-run rule can
  see it. [guard: cron-run-coverage.spec.ts]
- An alert rule lives in `infra/observability/grafana-cloud/catalog/alert-rules.mjs`, never in Grafana by hand, and
  its generated files are never edited. [guard: script:check:ops]
- No alert rule without a `## <rule key>` section in `docs/runbooks/<family>.md`, and no section without a rule.
  [guard: script:check:ops]

## Recipe: log in a service, a job and a cron

A service logs through its class logger; the context fields arrive on their own:

```ts
private readonly logger = new Logger(InvoiceSyncService.name);

this.logger.log({ msg: 'Invoice sync started', invoiceCount: batch.length });
this.logger.warn({ msg: `Invoice sync skipped for ${maskEmail(contact.email)}`, reason: 'no-address' });
this.logger.error({ msg: 'Invoice sync failed', err: toLoggableError(err) });
```

A job handler is the same: `BaseQueueDispatcher` runs `run(job)` inside `withJobContext`, so `jobName` and `jobId` are
on every line, and a final failure is logged and reported by the dispatcher. Do not catch and log what you rethrow.

A cron wraps its run in `CronRun`, as `packages/appshore/platform/src/auth/tokens-cleanup.processor.ts` does:

```ts
async run(_job: Job<JobEnvelope<unknown>>): Promise<{ swept: number }> {
  const cron = new CronRun(this.logger, APP_JOB_NAMES.BULK_OPS.INVOICE_SWEEP);
  await forEachTenant(APP_SYSTEM_REASONS.INVOICE_SWEEP, () => this.tenants.listActive(), async (tenant) => {
    try { await this.sweep(tenant.id); cron.succeeded(); }
    catch (err) { cron.failed(tenant.id, err, tenant.tenantId); }   // logs and reports the tenant
  });
  return { swept: cron.complete().tenantsOk };                       // one cron.completed line
}
```

Then add the job's file and names to `cron-run-coverage.spec.ts`'s list, declare its tenant context and register
its reason in `APP_SYSTEM_REASONS` ([`tenancy.md`](tenancy.md)), and give it a schedule ([`jobs-and-deadlines.md`](jobs-and-deadlines.md)).

## Recipe: report an error

Only where nothing else reports it: an HTTP 5xx and a job's final failure are already reported.

```ts
import { ERROR_SOURCE, reportError } from '@appshore/kernel/infrastructure/error-tracking/sentry';

reportError(err, { source: ERROR_SOURCE.EVENT }); // ambient request or job tags are added for you
```

Pass `{ level: 'warning' }` as the third argument for a handled but suspicious event (a reused refresh token is the
example in the code). Never put a message, address or amount in a tag.

## Recipe: add a metric within the label budget

1. In `metrics.ts`, add the instrument to `Instruments` and `createInstruments` with an `app_` name, and a `record*`
   function that takes typed arguments and builds the labels itself:
   ```ts
   invoiceSyncFailed: meter.createCounter('app_invoice_sync_failed', { description: 'Invoice sync failed {reason}' }),
   export function recordInvoiceSyncFailed(reason: InvoiceSyncFailureReason): void {
     instruments().invoiceSyncFailed.add(1, { reason });
   }
   ```
   `reason` is a constant object beside it, like `OTP_FAILURE_REASON`; a label from user input is never passed through.
2. Call `recordInvoiceSyncFailed(...)` where the failure happens.
3. Add a case to `metrics.spec.ts`. Add `tenant` only by amending the standard first.
4. Add the row to "What is measured" in `docs/observability.md`.

## Recipe: add an alert with its runbook

1. Add the rule to its area in `catalog/alert-rules.mjs` (the shape is the comment at the top of that file): one
   signal, `severity` `sev1` only if it should page in production, a query filtered on `env` and the service through
   the catalog's helpers, and `runbook: '<family>.md#<rule key>'`.
2. Add `## <rule key>` to `docs/runbooks/<family>.md` with what it means, the first three checks, mitigation and
   escalation (the shape is `docs/runbooks/README.md`).
3. Regenerate and check: `node infra/observability/grafana-cloud/scripts/generate.mjs`, then `pnpm check:ops`.
4. Applying it to Grafana is the manual `grafana-apply` workflow (`plan`, then `apply`), never part of a deploy.

## Flag in review

- An error flattened into `msg`, or a raw error object logged.
- A metric label that could hold an id, an address or an amount; a gauge summed instead of maxed.
- A `JobEnvelope` built by hand, so the request's id is lost.
- A `try/catch` that logs at error level and swallows: nothing is reported.
- An alert rule whose runbook section only restates the summary.
