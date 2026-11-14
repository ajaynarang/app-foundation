---
owner: foundation
sources:
  - infra/README.md
  - docs/operations.md
  - docs/observability.md
  - docs/doppler.md
  - docker-compose.yml
  - docker-compose.stg-debug.yml
  - infra/bootstrap/main.tf
  - infra/terraform/main.tf
  - infra/terraform/variables.tf
  - infra/terraform/ecs.tf
  - infra/terraform/tests/hardening.tftest.hcl
  - .github/workflows/deploy-all.yml
  - .github/workflows/deploy-frontend.yml
  - .github/workflows/quality-gate.yml
  - .github/workflows/grafana-apply.yml
  - .github/workflows/container.yml
  - .github/scripts/check-production-deployer.sh
  - .github/scripts/check-dockerfiles.sh
  - tools/verify/check-ops.sh
  - tools/verify/check-no-db-roles.sh
  - tools/db/migrate.sh
  - tools/db/tunnel.sh
  - infra/observability/grafana-cloud/catalog/constants.mjs
  - .claude/workflow.json
guards:
  - script:check:ops
  - script:guard:ci
examples:
  - PRODUCTION_DEPLOYERS
  - develop
---

# Infra and deploy: local services, Terraform, environments, the deploy workflows

What runs where, and how a change reaches staging and production. The step-by-step operator procedures (deploy,
migrations and the tunnel, containers and task roles, the maintenance switch, tenant reset, staging data on a laptop)
are `docs/operations.md`; Terraform file by file is `infra/README.md`; observability levels are
`docs/observability.md`; secrets are `docs/doppler.md`. Running a deploy is the `/app-deploy` skill.

**Local services** (`docker-compose.yml`; `docker compose up -d postgres redis` is all a backend needs):

| Service                          | Port on the host                  | Notes                                                  |
| -------------------------------- | --------------------------------- | ------------------------------------------------------ |
| Postgres 16 with pgvector        | 5499                              | Database `app`; the default `DATABASE_URL` points here |
| Redis 7                          | 6399                              | BullMQ, cache, rate limits                             |
| MinIO (S3)                       | 9300, console 9301 (loopback)     | File storage in development                            |
| Loki, Tempo, Prometheus, Grafana | 3100, 4318, 9090, 3003 (loopback) | `--profile observability`; laptops only                |
| Staging-debug Postgres and Redis | 5495, 6395 (loopback)             | `docker-compose.stg-debug.yml`, `pnpm stg-debug:up`    |

An optional feature chosen at scaffold time may add its own service to the compose file.

**Deployed environments.** Two, `staging` and `production`, on AWS: ECS Fargate (an API service and a worker
service), RDS Postgres, ElastiCache Redis, S3 and CloudFront, an ALB, CloudWatch logs; the web app on Vercel. Every
resource is named `<project>-<env>-...` (`local.prefix` in `infra/terraform/main.tf`). Runtime secrets come from
Doppler, one config per environment.

## Rules

- Infrastructure changes only through Terraform under `infra/terraform/`; `pnpm check:ops` runs `fmt -check`,
  `validate` and the offline `terraform test` files (the AWS provider is mocked). Never `terraform apply` from a
  pull request's checks. [guard: script:check:ops]
- Per-environment values live in `infra/terraform/environments/<env>.tfvars`, which git ignores (`*.tfvars`); they are
  never committed, and secrets in them come from `TF_VAR_*` or Doppler. [review-only: an ignored file cannot be
  scanned]
- Deploys run only from the manual workflows: `deploy-all.yml` (backend, migrations, then the web build hook) and
  `deploy-frontend.yml` (the web alone). Neither, nor `grafana-apply.yml` or `quality-gate.yml`, ever gets a push
  trigger. [guard: script:guard:ci]
- A production run of `deploy-all.yml` fails unless the actor is in the repo variable `PRODUCTION_DEPLOYERS` (unset
  locks production). [guard: script:check:ops]
- Staging deploys only from `develop`, production only from `main`; both deploy workflows refuse any other pairing.
  `deploy-frontend.yml` does not check `PRODUCTION_DEPLOYERS`, so a web-only production deploy is gated by the
  branch and by whoever may run the workflow. [review-only: the branch check is inline workflow shell, not tested]
- The migrations run before the services roll, so for a few minutes the previous release runs against the new schema.
  A migration must be safe for the code of the release before it: add a column before the code that writes it, drop
  one only after a release stopped reading it. [review-only: nothing checks two releases against one schema]
- Against a shared database, migrate with `tools/db/migrate.sh --env <env>` through `tools/db/tunnel.sh`, never
  `prisma migrate dev`; production writes need `production` typed. [review-only: an operator command]
- Roles and grants are made by migrations only; no script creates, grants or switches to a database role.
  [guard: script:check:ops]
- The backend image runs as `node`, never root, with `--chown=node:node` on every final-stage copy.
  [guard: script:check:ops]
- `OPS_GAUGES_FROM_API` is set on the API task exactly when `worker_desired_count = 0`, so one role reports the ops
  gauges. [guard: script:check:ops]
- `QUEUE_PROCESSORS_ENABLED` and `OPS_GAUGES_FROM_API` are set by Terraform only, never in Doppler, because Doppler
  values override the task environment. [review-only: Doppler's contents are outside the repository]

## What a product changes first

`pnpm init-app` sets the project slug (the `__PROJECT__` token in `infra/bootstrap/main.tf`,
`infra/terraform/main.tf` and `infra/terraform/iam.tf`, and `PROJECT` and `REPO_URL` in
`infra/observability/grafana-cloud/catalog/constants.mjs`). Then, before the first apply:

1. **Region.** `aws_region` defaults to `us-east-1`, and the state backend's region is written in
   `infra/terraform/main.tf`. Pick the product's region and set both; never assume one.
2. **The state bucket**: `cd infra/bootstrap && terraform init && terraform apply`, once per AWS account.
3. **The environment files**: write `infra/terraform/environments/staging.tfvars` and `production.tfvars` with every
   variable that has no default in `variables.tf` (`env`, `domain`, `api_subdomain`, the network ranges and zones,
   task sizes and counts, `rds_instance_class`, `github_repo`, `s3_cors_origins`, `doppler_token`), and `alarm_email`
   for level 1 alerts. Pass `doppler_token` and the RDS password as `TF_VAR_*`, not in the file.
4. **Doppler**: one config per environment with the keys `docs/doppler.md` lists; its service token goes to SSM through
   `doppler.tf`.
5. **GitHub**: the `staging` and `production` environments, the secrets named at the top of `deploy-all.yml`, the
   `PRODUCTION_DEPLOYERS` variable, and a `develop` branch (`git switch -c develop main && git push -u origin develop`).
6. **Sizes**: `worker_desired_count` (0 runs every queue in the API task; then set `HAS_WORKER = false` in the
   catalog), task CPU and memory, the RDS class and `rds_connections_alarm_threshold` to match it.

## Recipe: deploy to staging

```bash
git switch develop && git pull --ff-only
pnpm verify                                               # the same gates as a pull request
gh workflow run deploy-all.yml --ref develop -f environment=staging
gh run watch "$(gh run list --workflow deploy-all.yml --limit 1 --json databaseId -q '.[0].databaseId')"
curl -fsS https://<api host>/api/v1/health/ready            # api_subdomain.domain
```

Only the web changed: `deploy-frontend.yml` instead. Production is the same from `main` with
`-f environment=production`, by a listed deployer, after an explicit go-ahead. `/app-deploy` walks all of this and
works out which workflow a change needs.

## Flag in review

- A migration that drops or renames a column the previous release still reads.
- A secret or a tfvars value in a committed file, a workflow log line or an image layer.
- A new AWS resource not named from `local.prefix`, or a Terraform change with no `terraform test` case for a
  condition it adds.
- A new workflow that deploys or applies but is not on `manualAlways` in `.claude/workflow.json`.
- A switch set in Doppler that Terraform owns.
