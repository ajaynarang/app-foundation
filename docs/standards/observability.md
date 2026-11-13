# Logging and telemetry standard

The rules every log line, metric, trace and error report in this repo follows. Skills and reviews cite this file;
they do not restate it. `apps/backend/src/architecture/log-hygiene.spec.ts` checks the rules that can be read from
the source, so `pnpm test` (and `pnpm verify`) fails when one of them slips. The rest are review rules.

## Where things go

- **Logs.** pino, as JSON on stdout, always. With `LOG_TRANSPORT=loki` and a `LOKI_URL`, the same lines are also
  pushed to Loki (local stack, or Grafana Cloud with `LOKI_USERNAME` / `LOKI_PASSWORD`). Outside development stdout
  is never traded for Loki: it is the copy CloudWatch keeps when Loki is unreachable. In development stdout is
  pretty-printed.
- **The environment name.** `ENV_TYPE` (`production | sandbox | preprod | development`) maps to one observability
  name, `production | staging | development` (`packages/appshore/kernel/src/shared/utils/env-label.ts`). The Loki
  `env` label uses it, and so will the trace, error-tracker and web-marker environment. An unset or unknown
  `ENV_TYPE` reads `unknown`; the resolver never throws.
- **Masking.** `maskEmail`, `maskPhone`, `stripQueryString` and `scrubContactDetails`
  (`packages/appshore/kernel/src/shared/utils/log-redaction.ts`). The pino `req` serializer drops the whole query
  string; the `err` serializer masks emails and phones a provider echoes in any field of an error.
- **Email and SMS with no provider.** With `ENV_TYPE=development` the message is printed (masked recipient,
  subject, body), so the zero-config flows work. Anywhere else nothing is printed: `EmailService.sendEmail` throws
  `EmailNotConfiguredError`, and `SmsService.sendSms` returns `false` and logs one line with a masked number and no
  body.

## The rules

1. **The environment name comes from `ENV_TYPE`**, through `env-label.ts` or `env-type.ts`. `NODE_ENV` is read
   only for build and test mode (skip telemetry in tests, pretty-print in development). Never compare `NODE_ENV`
   with `'production'` to decide what an environment is; `isProductionEnv()` in
   `apps/backend/src/config/production-guard.ts` decides what a deployed task exposes. _Spec-checked._
2. **Context comes from the mixin.** Every line inside a request carries `requestId` and `traceId`, and `tenantId`,
   `tenantDbId`, `userId` and `role` once auth has run. Every line inside a job carries `jobName` and `jobId`.
   `logContextMixin` (`packages/appshore/kernel/src/infrastructure/logging/log-context-mixin.ts`) adds them; code
   never passes them by hand, except in BullMQ `failed` listeners, which run outside the job context
   (`reportJobFailure` does this for you). `BaseQueueDispatcher` runs every job inside `withJobContext`; a
   processor that owns its own queue wraps itself.
3. **No personal data and no credentials in a log line**: no phone, email, name, token, OTP, message body, amount,
   or URL with a query string. Use the mask helpers. _Spec-checked_ for template interpolations in logger calls.
4. **Log an error as an `err` field** built by `toLoggableError`
   (`packages/appshore/kernel/src/infrastructure/queue/job-events.ts`), never flattened into the message and never
   the raw error object: a raw HTTP-client error carries its request headers and body.
   `this.logger.error({ msg: 'Charge failed', err: toLoggableError(err) })`.
5. **A logger's context is its class name**: `new Logger(MyService.name)`. Alert rules match on it.
6. **`event` values are constants** in `job-events.ts` (`JOB_EVENTS`) or a sibling constants file. Renaming one
   breaks an alert.
7. **Use the Nest `Logger`. No `console.*` in `src`**, except on the spec's allow-list: process entry points before
   the logger exists (`main.ts`, `voice-agent.entry.ts`), CLI commands (`*.command.ts`), config load
   (`configuration.ts`, `firebase.config.ts`), and the telemetry and error-tracking bootstrap. _Spec-checked._
8. **Two Loki labels from code: `service` and `env`.** pino-loki adds `level` and `hostname` itself (`hostname` is
   one value per ECS task). Nothing else is promoted to a label; tenant, request and job ids stay in the JSON body.
9. **Metric instruments are created only in `metrics.ts`.** Labels are code constants, or values normalised there
   into a closed set. Never `userId`, `requestId`, `jobId`, a phone, an email or an amount. `tenant` appears only on
   `app_job_failed`, `app_ai_invocation` and `app_ai_invocation_cost_usd`. _Spec-checked._
10. **A 5xx answer is reported where its body is written** (`writeErrorEnvelope`). Every other error is reported
    through `reportError` with a `source` tag. Nothing else calls the Sentry SDK, and `@sentry/` is imported only
    under an `error-tracking/` folder. Logging at error level reports nothing: the tracker does not read logs.
    _The import is spec-checked._
11. **No alert rule without a runbook file and anchor. No runbook anchor without a rule.**
12. **Error-tracker and trace data collection stays off** for bodies, headers, cookies, query strings and model
    inputs.

Rules 10 to 12 describe the error tracker, the alert catalog and trace export, which arrive in later changes to this
repo; the rules hold from the day they do.

## What the spec does not catch

`log-hygiene.spec.ts` reads source text. A value renamed before it is logged (`const to = user.phone`) is not
caught, and neither is string concatenation (`'to ' + email`). `to` and `message` are not on its identifier list,
because they would flag every `err.message`; the email and SMS senders have their own specs instead. Rules 2, 4, 5,
6 and 8 are review rules.
