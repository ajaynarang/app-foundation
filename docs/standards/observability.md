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
  `env` label uses it, the backend error tracker reports it as its `environment` (an unknown value reports
  `development`), and the web reads the same three names from `NEXT_PUBLIC_APP_ENV`; trace export will too. An unset
  or unknown `ENV_TYPE` reads `unknown`; the resolver never throws.
- **Masking.** `maskEmail`, `maskPhone`, `stripQueryString` and `scrubContactDetails`
  (`packages/appshore/kernel/src/shared/utils/log-redaction.ts`). The pino `req` serializer drops the whole query
  string; the `err` serializer masks emails and phones a provider echoes in any field of an error.
- **Errors.** Sentry, off until `SENTRY_DSN` (backend) or `NEXT_PUBLIC_SENTRY_DSN` (web) is set
  (`packages/appshore/kernel/src/infrastructure/error-tracking/`, `packages/appshore/web-core/src/shared/lib/sentry*.ts`).
  An event carries a `source` tag (`http | job | cron | event | workflow | ai`) and ids only: `tenantId` (public id),
  `tenantDbId`, `role`, `jobName`, `jobId`, `queue`, `requestId`, `traceId`. Never a user id, name, email or phone.
  The web drops expected errors (a 4xx `ApiError`, chunk-load failures, aborts) and console breadcrumbs, and tags an
  API failure with the backend's `requestId`, so the event leads to its log lines.
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
10. **A 5xx answer is reported where its body is written** (`writeErrorEnvelope`, and `OAuthErrorFilter` on the
    OAuth protocol routes, whose RFC 6749 body is not the envelope). Every other error is reported
    through `reportError` with a `source` tag. Nothing else calls the Sentry SDK, and `@sentry/` is imported only
    under an `error-tracking/` folder. Logging at error level reports nothing: the tracker does not read logs.
    _The import is spec-checked._
11. **No alert rule without a runbook file and anchor. No runbook anchor without a rule.**
12. **Error-tracker and trace data collection stays off** for bodies, headers, cookies, query strings and model
    inputs.

Rule 10 and the error-tracker half of rule 12 hold now: `error-envelope.spec.ts` checks a 5xx is reported once on
either write path and a 4xx never, and `sentry.spec.ts` pins every data-collection category off. For traces, rule 12
holds through what is never instrumented (no body, header or cookie capture is switched on) and through the Langfuse
processor, which masks phones and emails in every string attribute of an AI span before it is exported
(`pii-masking-langfuse-span-processor.spec.ts`). Rule 11 describes the alert catalog, which arrives in a later
change to this repo; it holds from the day it does.

## What the spec does not catch

`log-hygiene.spec.ts` reads source text. A value renamed before it is logged (`const to = user.phone`) is not
caught, and neither is string concatenation (`'to ' + email`). A name is judged by its last word, so a sensitive
word earlier in the name (`otpCode`, `emailTo`, `tokenHash`) is not caught either. `to` and `message` are not on its identifier list,
because they would flag every `err.message`; the email and SMS senders have their own specs instead. Rules 2, 4, 5,
6 and 8 are review rules.
