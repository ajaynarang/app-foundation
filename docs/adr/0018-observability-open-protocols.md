# ADR-0018 — Observability: open protocols; Grafana Cloud and Sentry pre-wired and off without keys; CloudWatch alarms as the fallback

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

Every product built from this starter needs the same four things in production: logs, error reports, traces and
metrics, and alerts that page someone with a runbook in hand. Products differ in budget, in where they run and in
which vendor they already pay for. A fresh clone must still boot, test and deploy with no account anywhere.

What the code had when this was written: pino JSON logs on stdout with an optional Loki transport
(`packages/appshore/kernel/src/infrastructure/logging/`), an OpenTelemetry SDK exporting traces and metrics over
OTLP/HTTP (`packages/appshore/kernel/src/infrastructure/telemetry/`), Sentry on the backend and the web
(`packages/appshore/kernel/src/infrastructure/error-tracking/`, `packages/appshore/web-core/src/shared/lib/sentry*.ts`),
a Grafana-as-code catalog of alert rules, routing and dashboards (`infra/observability/grafana-cloud/`), runbooks
(`docs/runbooks/`) and CloudWatch alarms in Terraform (`infra/terraform/alarms.tf`). The rules every line and report
follows are `docs/standards/observability.md`; the operator's view is `docs/observability.md`.

## Decision

**Telemetry leaves the process only over open protocols (pino JSON, OTLP, the Sentry SDK). The production default is
Grafana Cloud for logs, traces, metrics and alerts plus Sentry for errors, pre-wired and off until their keys are set.
With no vendor, basic CloudWatch alarms are the fallback.**

- **Off without keys.** No key, no export: logs stay on stdout, the OTLP SDK carries trace context with no exporter,
  every metric call is a no-op, and Sentry never initialises. Nothing retries into the void. Held by
  `telemetry.spec.ts`, `telemetry-config.spec.ts` and `sentry.spec.ts`.
- **Three levels, climbed in order.** Level 0 is stdout only. Level 1 is `alarm_email` in tfvars: ten CloudWatch
  alarms and an AWS budget email. Level 2 is Grafana Cloud and Sentry: the alert catalog, dashboards, paging through
  Grafana IRM, error tracking. The level 1 alarms are removed last (`grafana_alerting_live = true`), and Terraform
  refuses that flag in production while Grafana cannot read CloudWatch. Held by
  `infra/terraform/tests/observability.tftest.hcl`, in `pnpm check:ops`.
- **One environment name everywhere.** `ENV_TYPE` maps to `production`, `staging` or `development` for the Loki
  `env` label, the Sentry environment and the OTLP resource (`packages/appshore/kernel/src/shared/utils/env-label.ts`).
  Held by `env-label.spec.ts`, and by `log-hygiene.spec.ts`, which refuses a `NODE_ENV` comparison deciding it.
- **Alerts and dashboards are code.** The catalog is the source; generated files are never edited; every rule has a
  runbook section and every section a rule; applying is the manual `grafana-apply` workflow, never a deploy step.
  Held by `validate.mjs` and `generate.mjs --check` in `pnpm check:ops`, and by `pnpm guard:ci` for the workflow.
- **What a log line, metric or report may carry** is the standard's rules 2 to 12: context from the mixin, no
  personal data or credentials, instruments only in `metrics.ts` with a closed label set, 5xx reported where the
  body is written, nothing else calling the SDK, and data collection off. Held by `log-hygiene.spec.ts`,
  `error-envelope.spec.ts`, `sentry.spec.ts` and `sentry-auto-capture.spec.ts`; the rest are review rules the
  standard lists.

## Consequences

- A product can swap Grafana Cloud or Sentry for any backend that speaks OTLP or the Sentry protocol by changing keys,
  not code. The catalog's queries are LogQL and PromQL, so a non-Grafana backend rewrites the catalog, not the app.
- A product that sets these keys sends data outside AWS and lists Grafana and Sentry as subprocessors in its privacy
  terms.
- The alert rules are written from the code, not tuned on live traffic. The test-fire step in
  `docs/observability.md` is the first proof that they page.
- Left out on purpose: session replay, performance tracing in Sentry, and any self-hosted production stack. The
  local Loki, Tempo, Prometheus and Grafana profile in `docker-compose.yml` is for laptops only.
