---
name: app-deploy
description: Deploy this product to staging or production through its manual GitHub Actions workflows (deploy-all.yml for the backend, migrations and web; deploy-frontend.yml for the web alone). Works out what changed since the running release, starts the right workflow with gh workflow run, watches it and checks health. Staging by default; production only on an explicit go-ahead, from main, by a listed deployer. Use for "deploy", "ship it", "release", "deploy staging", "push to production".
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
owner: foundation
guards:
  - script:guard:ci
  - script:check:ops
  - script:verify
examples:
  - develop
  - PRODUCTION_DEPLOYERS
---

# Deploy

**Command:** $ARGUMENTS — optional: `staging` (default) or `production`; `backend`, `web` or `all` to name the
legs instead of working them out.

What the workflows do, step by step, is "Deploy" in `docs/operations.md`; what a product sets up before its first
deploy is "What a product changes first" in the infra reference,
[`infra-and-deploy.md`](../app-conventions/references/infra-and-deploy.md). This skill drives them; it does not
replace them. Every workflow here is manual (`workflow_dispatch`) and stays manual (`pnpm guard:ci`).

| Workflow              | Ships                                                                            | Branch                                       |
| --------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `deploy-all.yml`      | Backend image to ECR, migrations and seeds, the ECS services, then the web build | `develop` for staging, `main` for production |
| `deploy-frontend.yml` | The web app alone, through the Vercel deploy hook                                | the same                                     |

`quality-gate.yml` (the Playwright suites against a deployed environment) and `grafana-apply.yml` (alert rules and
dashboards) are run by hand too, but they are not deploys; offer them after one, never instead of one.

## Standing rules

1. **Staging deploys from `develop`; production only from `main`.** Production goes through a pull request from
   `develop` to `main` first. The workflow refuses production unless the person who starts it is in the repo variable
   `PRODUCTION_DEPLOYERS`; `deploy-frontend.yml` does not check that list, so check it yourself before a web-only
   production run (step 2 of phase 1). Production is a separate, deliberate act: ask every time, and run it only
   when the user says so for this deploy, in this session. A go-ahead for staging is not one for production.
   [guard: script:check:ops]
2. **Deploy a leg only if it changed** (phase 0). An unchanged backend is not redeployed to "be safe": a deploy runs
   migrations. [review-only: a judgement on the diff]
3. **Read the version, never recall it.** The running backend's version is the image tag on its ECS task definition
   (the git SHA it was built from); a package version is the `version` in the `package.json` that owns it. A version
   written in a doc or remembered from earlier is stale. [review-only: what the agent reads]
4. **The migration must be safe for the release before it.** The services roll after the migrations, so the old
   release runs on the new schema for a few minutes. A pending migration that drops or renames something the running
   code reads stops the deploy: say so and stop.
   [review-only: nothing checks two releases against one schema]
5. **Never pass a secret on the command line, and never print one.** The workflows read their secrets from GitHub
   and Doppler. [review-only: a command line is not scanned]

## Phase 0 — What changed

Skip only when the user named the legs. Compare with what is running, not with a guess:

```bash
PREFIX=<project>-<env>                    # project: the Terraform project variable; env: staging | production
TD=$(aws ecs describe-services --cluster "$PREFIX-ecs-cluster" --services "$PREFIX-ecs-service-api" \
  --query 'services[0].taskDefinition' --output text)
DEPLOYED=$(aws ecs describe-task-definition --task-definition "$TD" \
  --query 'taskDefinition.containerDefinitions[0].image' --output text | sed 's/.*://')
git fetch origin && git log --oneline "$DEPLOYED..origin/develop" | head -20      # origin/main for production
git diff --name-only "$DEPLOYED..origin/develop" -- apps/backend packages/appshore packages/shared-types | head
git diff --name-only "$DEPLOYED..origin/develop" -- apps/web packages/ui packages/appshore/web-core | head
git diff --name-only "$DEPLOYED..origin/develop" -- packages/appshore/db/prisma/migrations | head
```

The `aws` calls are read-only; they need credentials for that environment's account. Without them, ask the user for
the last deployed commit rather than guessing.

- Backend or shared packages changed: `deploy-all.yml` (it also triggers the web build).
- Only the web changed: `deploy-frontend.yml`.
- Nothing changed: say so and stop.
- A migration is pending: read it against rule 4 before going on.

Report every leg you skip, with the reason.

## Phase 1 — Gate

1. On the branch you deploy, at the commit you deploy: `git switch develop && git pull --ff-only`, then `pnpm verify`.
   It must end `verify: PASS <sha>` for that commit. CI is manual, so this is the gate; absence of a CI run is not a
   pass.
2. Production only: confirm the user is a listed deployer.
   `gh variable get PRODUCTION_DEPLOYERS` must name their GitHub login (`gh api user -q .login`). If it is unset,
   production is locked: stop and say how to set it (`docs/operations.md`, "Deploy").
3. Production only: repeat back what will ship (the commit range from phase 0, the pending migrations) and wait for a
   yes for production in so many words.

## Phase 2 — Run and watch

```bash
gh workflow run deploy-all.yml --ref develop -f environment=staging          # or deploy-frontend.yml
sleep 5; RUN=$(gh run list --workflow deploy-all.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN" --exit-status
```

Use `--ref main -f environment=production` for production. Watch to the end; a run you started and did not watch is
not a deploy. On a failure, read the failed job's log (`gh run view "$RUN" --log-failed`), report the step and the
error, and stop: do not re-run a deploy whose migration job failed until the cause is known. The deploy-marker steps
(Sentry release, Grafana annotation) warn and never fail a deploy; mention a warning, do not treat it as a failure.

## Phase 3 — Check

- `curl -fsS https://<api host>/api/v1/health/ready` answers 200 (database and Redis reachable).
- Phase 0's query now returns the commit you shipped.
- The web build: the Vercel deployment for that commit is ready, and the web app loads and signs in. For a change a
  person would see, drive it with `/app-verify` against the deployed URL.
- Offer `quality-gate.yml` (suite `smoke`) against the environment.

## Phase 4 — Report

Per leg: deployed (commit, run URL, migrations applied, health) or skipped and why. Anything that warned. For
production, the deployer and the go-ahead. Never claim a deploy you did not watch to green.

## Stop when

- The user has not said "production" for this deploy and the target is production.
- `pnpm verify` is not green on the commit you would ship, or the tree is dirty.
- A pending migration breaks the running release (rule 4).
- The deployed commit cannot be read and the user cannot say it.
- A run fails: report it; do not retry blindly.
