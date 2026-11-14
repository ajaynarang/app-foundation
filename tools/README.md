# tools/

Operator scripts and dev utilities. Not application code — these are invoked by humans (or CI) to set up, debug, deploy, or maintain the platform.

## Layout

| Folder      | Purpose                                               |
| ----------- | ----------------------------------------------------- |
| `init-app/` | One-time template rename (see `init-app/README.md`)   |
| `db/`       | Database tunnel, migrations, staging pull             |
| `ops/`      | Operator switches (maintenance mode)                  |
| `dev/`      | Local dev environment helpers                         |
| `verify/`   | The local gates a branch passes before a pull request |
| `.dumps/`   | Saved DB dumps (gitignored)                           |

## Scripts

### `init-app/`

| Script                                      | What it does                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init-app/init-app.mjs`                     | Renames the template (package scope, project name, infra prefix). Run via `pnpm init-app`.                                                                                    |
| `init-app/check-scaffold-observability.mjs` | Copies the tree, runs init-app, and checks the Grafana-as-code catalog was renamed, regenerated and still validates. A step of `pnpm verify:scaffold`; runs alone in seconds. |

### `db/`

| Script               | What it does                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/tunnel.sh`       | SSM port-forward to the staging (`localhost:5433`) or production (`--env production`, `localhost:5434`, typed confirmation) RDS through a running API service task.                                                                                       |
| `db/migrate.sh`      | Prisma migrations, base seeds and the knowledge-base sync against local, staging or production (AWS targets open an SSM tunnel first; production needs `production` typed). See `docs/operations.md`.                                                     |
| `db/pull-staging.sh` | Copies staging into the local stg-debug database (`docker-compose.stg-debug.yml`, `localhost:5495`), never the dev one: dump with `--no-owner --no-privileges` into `tools/.dumps/`, restore, migrate. Staging only. Tested by `db/pull-staging.test.sh`. |
| `db/lib/db-env.sh`   | Shared by all three: environment names, the host check, the never-reuse-a-tunnel check, the production confirmation and the API jump host. Tested by `db/db-env.test.sh`.                                                                                 |

### `ops/`

| Script                    | What it does                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ops/maintenance-mode.sh` | `on`, `off`, `status` for the web app's maintenance document in the CDN bucket (read-modify-write; production typed). Tested by its `.test.sh`. |

### `dev/`

| Script             | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `dev/app-dev.sh`   | Open iTerm2 tabs running backend + web with custom ports. |
| `dev/install.sh`   | One-time project bootstrap (run from repo root).          |
| `dev/kill-port.sh` | Kill the process holding a given port.                    |

### `verify/`

| Script                        | What it does                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify/verify.sh`            | `pnpm verify`: format check, lint, schema lint, type-check, unit tests, `check:ops`, build. Ends with one result line.                                                                                                                                                                                                                                  |
| `verify/api-qa.sh`            | `pnpm verify:api`: builds, migrates, seeds, boots the backend and runs the Playwright `api` project against it. For a change to the wire. Ends with one result line.                                                                                                                                                                                    |
| `verify/check-ops.sh`         | `pnpm check:ops`: the Grafana-as-code catalog (`generate.mjs --check`, `validate.mjs`, its specs), every `*.test.sh` under `.github/scripts/` and `tools/`, and Terraform fmt / validate / test when `terraform` is installed. Part of `pnpm verify`; the pre-push hook runs it when a push touches `infra/`, `docs/runbooks/`, `.github/` or `tools/`. |
| `verify/check-no-db-roles.sh` | Fails when a file under `tools/`, `.github/`, `infra/` or `scripts/` creates, grants or switches to a database role (or names the removed AI reader role): roles are made by migrations only. Its test runs in `check:ops`.                                                                                                                             |
| `verify/push-touches-ops.sh`  | Used by the pre-push hook: exit 0 when the pushed commits touch the paths `check:ops` checks. Its hermetic test is `push-touches-ops.test.sh`.                                                                                                                                                                                                          |

## Common tasks

```bash
# Make the template yours (rename scope/project)
pnpm init-app

# Open SQL client to staging
./tools/db/tunnel.sh               # then connect to localhost:5433

# Copy staging into the second local stack (never the dev database)
pnpm stg-debug:up && pnpm stg-debug:pull && pnpm stg-debug:backend

# Maintenance mode on staging
./tools/ops/maintenance-mode.sh on "Database upgrade" 1h

# Local migrations (use this, not `prisma migrate dev`)
./tools/db/migrate.sh --env local --migrate-only -y

# Side-by-side dev tabs (iTerm2)
pnpm dev:side
pnpm dev:side:stop
```

## Conventions

- Scripts are language-agnostic operator tooling. TypeScript scripts that need the backend dep graph (Prisma client, NestJS bootstrap) live in `apps/backend/scripts/` instead.
- Path-relative paths inside scripts compute `TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"` so subfolders can reach repo root via `$TOOLS_DIR/..`.
- Dumps land in `tools/.dumps/` (gitignored) regardless of which `db/*.sh` script writes them. A staging dump can hold real people's data: delete it when done.
