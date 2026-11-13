# tools/

Operator scripts and dev utilities. Not application code — these are invoked by humans (or CI) to set up, debug, deploy, or maintain the platform.

## Layout

| Folder      | Purpose                                               |
| ----------- | ----------------------------------------------------- |
| `init-app/` | One-time template rename (see `init-app/README.md`)   |
| `db/`       | Database tunnel and migrations                        |
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

| Script          | What it does                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `db/tunnel.sh`  | SSM port-forward to the staging RDS via a running ECS task. Postgres available at `localhost:5433`.                           |
| `db/migrate.sh` | Run Prisma migrations against local or staging (staging opens an SSM tunnel first; avoids `prisma migrate dev` drift resets). |

### `dev/`

| Script             | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `dev/app-dev.sh`   | Open iTerm2 tabs running backend + web with custom ports. |
| `dev/install.sh`   | One-time project bootstrap (run from repo root).          |
| `dev/kill-port.sh` | Kill the process holding a given port.                    |

### `verify/`

| Script                       | What it does                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify/verify.sh`           | `pnpm verify`: format check, lint, schema lint, type-check, unit tests, `check:ops`, build. Ends with one result line.                                                                                                                                                                                                                                  |
| `verify/api-qa.sh`           | `pnpm verify:api`: builds, migrates, seeds, boots the backend and runs the Playwright `api` project against it. For a change to the wire. Ends with one result line.                                                                                                                                                                                    |
| `verify/check-ops.sh`        | `pnpm check:ops`: the Grafana-as-code catalog (`generate.mjs --check`, `validate.mjs`, its specs), every `*.test.sh` under `.github/scripts/` and `tools/`, and Terraform fmt / validate / test when `terraform` is installed. Part of `pnpm verify`; the pre-push hook runs it when a push touches `infra/`, `docs/runbooks/`, `.github/` or `tools/`. |
| `verify/push-touches-ops.sh` | Used by the pre-push hook: exit 0 when the pushed commits touch the paths `check:ops` checks. Its hermetic test is `push-touches-ops.test.sh`.                                                                                                                                                                                                          |

## Common tasks

```bash
# Make the template yours (rename scope/project)
pnpm init-app

# Open SQL client to staging
./tools/db/tunnel.sh               # then connect to localhost:5433

# Local migrations (use this, not `prisma migrate dev`)
./tools/db/migrate.sh --env local --migrate-only -y

# Side-by-side dev tabs (iTerm2)
pnpm dev:side
pnpm dev:side:stop
```

## Conventions

- Scripts are language-agnostic operator tooling. TypeScript scripts that need the backend dep graph (Prisma client, NestJS bootstrap) live in `apps/backend/scripts/` instead.
- Path-relative paths inside scripts compute `TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"` so subfolders can reach repo root via `$TOOLS_DIR/..`.
- Dumps land in `tools/.dumps/` (gitignored) regardless of which `db/*.sh` script writes them.
