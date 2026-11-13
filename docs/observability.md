# Observability

How a product built from this template is observed in a deployed environment: where errors, logs, traces and
metrics go, and which keys switch each one on. The rules every log line and error report follows are in
[`standards/observability.md`](standards/observability.md); this page is the operator's view.

Nothing here is required to boot, test or deploy. With no key set the app runs, writes JSON logs to stdout and sends
nothing anywhere. Each vendor is switched on by its own key and is a no-op without it.

> This page grows with the observability work. Today it covers error tracking and logs. Traces, metrics, alert
> rules, dashboards and the AWS fallback alarms are added to it as they land.

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

| Source     | Reported by                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `http`     | Every 5xx answer, once, where its body is written (`writeErrorEnvelope`), and a 5xx a streaming route ends with. |
| `job`      | A queue job's final failure (`reportJobFailure`). A retry BullMQ will run again is not reported.                 |
| `cron`     | Each tenant a scheduled sweep fails for (`CronRun.failed`).                                                      |
| `event`    | A domain event that could not be queued for its durable path, or not written to the event log.                   |
| `workflow` | A durable workflow function that used up its retries.                                                            |
| `ai`       | A provider refusing a platform-paid AI call for credit (not a 5xx, so nothing else reports it).                  |

A reused refresh token (a possible stolen session) is reported at warning level. A 4xx is never reported; a line
logged at error level is not reported either, because the tracker does not read logs.

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
