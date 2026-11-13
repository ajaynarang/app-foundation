# Grafana as code

Alert rules, notification routing and dashboards for a hosted Grafana stack (Grafana Cloud by default), kept in the
repo and applied by script. Staging and production run the same rules and boards; they differ only by the `env`
label and by routing (a production `sev1` pages, everything else notifies).

This is level 2 of the ladder in [`docs/observability.md`](../../../docs/observability.md). Nothing here is needed to
boot, test or deploy. The local Loki, Tempo, Prometheus and Grafana profile (`infra/observability/` beside this
folder) is separate and for laptops only.

```
catalog/                 SOURCE OF TRUTH. Edit here.
  constants.mjs          PROJECT, REPO_URL, HAS_WORKER and everything derived from them
  alert-rules.mjs        the rule catalog, one area per rule group
  build-alerting.mjs     catalog -> Grafana provisioning objects (rules, contact points, policies, template)
  dashboards/            the four boards and the small layout kit they share
alerting/                GENERATED (Grafana file-provisioning format, the same as Grafana's "Export")
  rules/<area>.yaml      one file per area, holding its group for every environment
  contact-points.yaml    irm-oncall, irm-notify
  notification-policies.yaml
  templates.yaml         the notification template (title, and a message with the runbook link)
dashboards/*.json        GENERATED
scripts/
  generate.mjs           catalog -> alerting/ and dashboards/   (--check fails when a file is stale)
  validate.mjs           structure, runbook links, label hygiene, names checked against the code
  grafana-apply.mjs      apply through the Grafana HTTP API; a dry run unless --apply
  catalog.test.mjs       the specs for the three scripts (node --test)
```

Never edit a generated file by hand. Change the catalog, then:

```bash
node infra/observability/grafana-cloud/scripts/generate.mjs
pnpm check:ops
```

The scripts are plain Node 20 ES modules with no installed package (the YAML writer is in `scripts/lib/`), so
`pnpm init-app` can regenerate them on a fresh clone.

## Product constants

Every product-specific name comes from three constants in `catalog/constants.mjs`:

| Constant     | Default                                 | What derives from it                                                                                                                                                                                 |
| ------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT`    | `app`                                   | The service name `<PROJECT>-backend` in every Loki selector and metric matcher; the AWS names `<PROJECT>-<env>-…`; folder, board and template names. Same value as the Terraform `project` variable. |
| `REPO_URL`   | `https://github.com/your-org/your-repo` | Every runbook link (`<REPO_URL>/blob/main/docs/runbooks/…`). `grafana-apply.mjs --apply` refuses to run while it is the placeholder.                                                                 |
| `HAS_WORKER` | `true`                                  | `false` for a product with no worker task (`worker_desired_count = 0`): the worker service-gone rule and the worker panels are left out, because a service with no task sends no metric.             |

`pnpm init-app` sets `PROJECT` from `--name` and `REPO_URL` from `--repo-url` (or the git remote), then runs
`generate.mjs`. When it cannot, it prints the command. Set `HAS_WORKER` by hand, then regenerate. Each environment's
`rdsMaxConnections` is in `ENVS`: set it to your instance class's `max_connections`.

## What is in it

**Rules.** None yet in this part: the starter catalog and its runbooks come with the next part of this work. The
routing, the contact points and the template are already here.

**Routing.** Two contact points, both Grafana IRM webhooks: `irm-oncall` (pages) and `irm-notify` (notifies). A
rule labelled `env=production, severity=sev1` goes to `irm-oncall`; everything else, a staging `sev1` included, goes
to `irm-notify`. Who is on call and how IRM reaches them (phone, app, chat) is set in IRM, not here.

**Dashboards** (folder "`<PROJECT>` dashboards"). Each has an `env` variable and datasource variables (`loki`,
`prom`, `cloudwatch`), so the JSON holds no stack-specific UIDs, and each shows deploy annotations tagged `deploy`
and the environment.

| Board             | What it shows                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview          | Golden signals from logs (5xx, error lines, heartbeats, final job failures) and metrics (rate, 5xx share, latency, queues, outbox and deadline age), and the AWS side from CloudWatch. |
| Queues and jobs   | Job failures and `job.unknown`, the heartbeat, cron completions and run time against the five-minute `bulk-ops` lane budget, queue depth and age, cron lateness.                       |
| SLOs              | 99.5% availability of non-4xx requests over 30 days, error budget left, burn rates (14.4x and 6x lines), p95 under 1 s, slowest routes.                                                |
| Per-tenant health | Which tenants are hurting, then one tenant (the Tenant ID box takes the public `tenantId` from an alert): errors, failed jobs, outbound and AI errors, AI use and spend.               |

The ops gauges (queue depths, cron intervals, outbox and deadline ages) come from the one reporting process, or from
every API task when there is no worker, so every panel on them uses `max`, never `sum`. `validate.mjs` holds that.

## Datasource UIDs

Alert rules cannot use variables for datasources, so the generated YAML carries placeholders. `grafana-apply.mjs`
substitutes them; Grafana file provisioning expands the same `${VAR}` syntax from its own environment.

| Placeholder                 | Default             | What it is                                                                   |
| --------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `${GRAFANA_LOKI_UID}`       | `grafanacloud-logs` | the stack's Loki                                                             |
| `${GRAFANA_PROM_UID}`       | `grafanacloud-prom` | the stack's Prometheus                                                       |
| `${GRAFANA_CLOUDWATCH_UID}` | `cloudwatch`        | the CloudWatch datasource you add with the read-only role (give it this UID) |

Find a UID under Connections, Data sources, then the datasource: the URL ends in `/edit/<uid>`.

## Applying

The script is a dry run unless `--apply` is passed. Every call is an upsert, so re-running is safe. Sections run in
this order: `folders, templates, contact-points, policies, rules, dashboards`; `--only rules,dashboards` limits a run.
A rule group is replaced whole, so a rule removed from the catalog is deleted from Grafana. Rules are provisioned
(locked in the UI); `--editable` leaves them editable, at the cost of drift.

| Key                                                              | Needed for                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GRAFANA_URL`, `GRAFANA_SA_TOKEN`                                | `--apply` (a service account with the Editor role, Admin to replace the policy tree) |
| `IRM_ONCALL_WEBHOOK_URL`                                         | `--apply`: it refuses without it, since a `sev1` would reach nobody                  |
| `IRM_NOTIFY_WEBHOOK_URL`                                         | optional: unset leaves that contact point as it is in Grafana                        |
| `GRAFANA_LOKI_UID`, `GRAFANA_PROM_UID`, `GRAFANA_CLOUDWATCH_UID` | optional overrides of the defaults above                                             |

These are apply-time secrets, never app config: no app process reads them, so they never go in Doppler.

```bash
node infra/observability/grafana-cloud/scripts/grafana-apply.mjs           # prints the plan
node infra/observability/grafana-cloud/scripts/grafana-apply.mjs --apply   # applies it
```

`--apply` also refuses while `REPO_URL` is the placeholder, while a generated file is stale, and (for rules) until
Loki has seen logs with both `env=production` and `env=staging` in the last 24 hours. The rules assume `env` comes
from `ENV_TYPE`; a stack that labelled logs from `NODE_ENV` would count staging errors as production ones.
`--skip-env-check` overrides that last check, only once you have confirmed the labels another way.

## Validation

```bash
pnpm check:ops                                   # the local gate: generate --check, validate, these specs
node infra/observability/grafana-cloud/scripts/generate.mjs --check
node infra/observability/grafana-cloud/scripts/validate.mjs
# with the local stack up (docker compose --profile observability up -d):
node infra/observability/grafana-cloud/scripts/validate.mjs --loki http://localhost:3100   # every LogQL query parses
node infra/observability/grafana-cloud/scripts/validate.mjs --promtool-file /tmp/promql.yaml
```

`validate.mjs` fails on: a stale generated file; a rule with no `sev1`/`sev2` severity, no env label, or no
summary, description or runbook link; a runbook link whose file under `docs/runbooks/` is missing or has no
`## <anchor>` heading; a `##` heading there that is no rule's anchor; a paused rule; staging and production rule sets
that differ; a query that does not filter its environment and this product's service; a group-by label outside the
reviewed list (no user, request or job id, phone, email or amount); a `level` value pino-loki never writes; a Logger
context that is no `new Logger(X.name)` in the code; an `app_*` metric `metrics.ts` does not create; a `sum` over an
ops gauge; any rule but `ecs-service-gone-worker` selecting on the worker; notification routing that sends anything
but a production `sev1` (checked for every env and severity, and every rule's labels) to `irm-oncall`.

`pnpm check:ops` runs on `pnpm verify` and on the pre-push hook when a push touches `infra/`, `docs/runbooks/`,
`.github/` or `tools/`. The manual workflow `.github/workflows/grafana-as-code.yml` runs the same script, and
`node tools/init-app/check-scaffold-observability.mjs` proves a scaffolded copy still passes.
