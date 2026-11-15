# Alert runbooks

One file per alert family, one `##` section per rule. Every rule in
[`infra/observability/grafana-cloud/catalog/alert-rules.mjs`](../../infra/observability/grafana-cloud/catalog/alert-rules.mjs)
links to its section through its `runbook_url` annotation, and the notification carries the link.
`pnpm check:ops` (`validate.mjs`) fails when a rule has no section here, and when a `##` heading here is no rule's
anchor. So a `##` heading is always a rule key; everything else in a file uses `###` or deeper.

Each section answers four things in the same order: what it means, the first three checks, mitigation, escalation.

## Conventions

- `<project>` is `PROJECT` in `catalog/constants.mjs` (the Terraform `project` value); `<env>` is `production` or
  `staging`. AWS names are `<project>-<env>-…`; the backend's `service` label is `<project>-backend`.
- `{sel}` is the Loki selector `{service="<project>-backend", env="<env>"}`. The alert's `env` label says which
  environment fired.
- Every rule assumes the Loki `env` label comes from `ENV_TYPE` (`production`, or `staging` for `sandbox` and
  `preprod`), never from `NODE_ENV`. If a production alert's lines come from a staging task, the labels are wrong:
  fix them before acting on the alert.
- Boards (folder "`<project>` dashboards"): Overview, Queues and jobs, SLOs, Per-tenant health (put the alert's
  `tenantId` in the Tenant ID box). Each has an `env` selector.
- Errors are in Sentry (filter `environment:<env>`, tag `tenantId`, `requestId`). Logs, metrics and traces are in
  Grafana. Pages and notifications arrive through Grafana IRM.
- Logs mask phones and emails. Never paste a full phone number or email address into a query or a ticket.
- AWS commands here are read-only. A change (rollback, scaling, a Terraform apply) follows the product's own deploy
  procedure (`docs/operations.md`).

## Severity and escalation

- `sev1` in production pages the on-call person (contact point `irm-oncall`). Everything else, a staging `sev1`
  included, notifies (`irm-notify`) and is handled in working hours.
- The on-call person owns a page until it resolves or is handed over. Escalate to the product's owner when it is not
  mitigated in 30 minutes, when customer data may be at risk, or when a fix needs an infrastructure change. Who that
  is, and how IRM reaches them, is set in IRM, not here.
- Anything customers notice: the owner decides on customer communication.

## Index

| Runbook                          | Rules                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [api.md](api.md)                 | `api-5xx-rate` (sev1), `api-availability-burn-fast` (sev1), `api-availability-burn-slow` (sev2), `api-latency-p95` (sev2)                                                                   |
| [queues-jobs.md](queues-jobs.md) | `job-failed-final`, `worker-heartbeat-missing`, `queue-stalled`, `outbox-backlog`, `deadline-sweep-late`, `cron-missed` (sev1); `job-unknown`, `cron-tenants-failed` (sev2)                 |
| [outbound.md](outbound.md)       | `otp-provider-failures` (sev1), `outbound-failures` (sev2)                                                                                                                                  |
| [ai.md](ai.md)                   | `ai-error-ratio` (sev2)                                                                                                                                                                     |
| [infra.md](infra.md)             | `rds-storage-low`, `rds-connections-high`, `redis-memory-high`, `ecs-service-gone-api`, `ecs-service-gone-worker` (sev1); `rds-cpu-high`, `rds-freeable-memory-low`, `rds-swap-high` (sev2) |

Two pages do not come from these rules: the outside-in uptime check (the API or the web root does not answer) and,
if you route them to IRM, Sentry issue alerts. Start those from the check or the Sentry issue, then use
[api-5xx-rate](api.md#api-5xx-rate) and [ecs-service-gone-api](infra.md#ecs-service-gone-api).
