---
owner: foundation
status: interim
pending: F4
sources:
  - docs/standards/observability.md
  - docs/observability.md
  - packages/appshore/kernel/src/infrastructure/logging/request-context.middleware.ts#requestContextStorage
  - packages/appshore/kernel/src/infrastructure/logging/log-context-mixin.ts#logContextMixin
  - packages/appshore/kernel/src/infrastructure/telemetry/telemetry.ts
  - packages/appshore/kernel/src/infrastructure/telemetry/metrics.ts
guards:
  - log-hygiene.spec.ts
  - error-envelope.spec.ts
  - sentry.spec.ts
  - script:check:ops
---

# Observability: logging, errors, metrics, traces

Moved from the old backend skill; its finish pull request adds the recipes (logging in a service, a job and a cron;
reporting an error; adding a metric within the label budget; adding an alert with its runbook) and the production
default, written from the code. The standard every log line, metric, trace and error report follows is
`docs/standards/observability.md`; this file does not restate it. How to turn the vendors on is `docs/observability.md`.

## Rules

- Logging, metrics and error reporting follow `docs/standards/observability.md`. The rules that can be read from source
  fail `pnpm test`. [guard: log-hygiene.spec.ts]
- A logger is `new Logger(ClassName.name)`; never `console.*` in `src` outside the standard's allow-list.
  [guard: log-hygiene.spec.ts]
- Context comes from the mixin, never by hand: inside a request every line carries `requestId`, `traceId` and, once
  auth has run, the tenant and user; inside a job, `jobName` and `jobId`. [guard: log-context-mixin.spec.ts]
- The request middleware accepts an incoming `x-request-id` only as a UUID (anything else is replaced) and echoes the
  id in the response, so a client can correlate. [review-only: no spec covers the header check yet]
- A request that enqueues work forwards its `requestId` into the job payload as `correlationId`
  (`requestContextStorage.getStore()?.requestId`), so the worker's lines join the request's chain.
  [review-only: needs reading]
- No request id, tenant id or internal id goes into a user-facing exception message; they belong in the logs, where
  context already puts them. [guard: api-contract.spec.ts]
- A 5xx is reported where its body is written (`writeErrorEnvelope`); every other error goes through `reportError`
  with a `source` tag. Nothing else calls the Sentry SDK. [guard: error-envelope.spec.ts, sentry.spec.ts]
- Metric instruments are created only in `packages/appshore/kernel/src/infrastructure/telemetry/metrics.ts`, with
  labels from a closed set. [guard: log-hygiene.spec.ts]
- Model calls are traced to Langfuse through the masked paths the standard names; a new path to Langfuse needs its own
  mask. [guard: pii-masking-langfuse-span-processor.spec.ts]
- An alert rule needs its runbook section, and a runbook section its rule. [guard: script:check:ops]

## Flag in review

- An error flattened into a log message, or a raw error object logged.
- A metric label that could hold a user id, a request id or an amount.
- A queue job enqueued without the request's `correlationId`.
- A direct Sentry import outside an `error-tracking/` folder.
