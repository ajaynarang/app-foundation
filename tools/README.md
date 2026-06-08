# tools/

Operator scripts and dev utilities. Not application code — these are invoked by humans (or CI) to set up, debug, deploy, or maintain Sally.

## Layout

| Folder              | Purpose                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `db/`               | Database tunnel, staging pull, migrations                             |
| `staging/`          | Staging env operations (wake/sleep, maintenance mode)                 |
| `stripe/`           | Stripe product/price sync                                             |
| `dev/`              | Local dev environment helpers                                         |
| `.dumps/`           | Saved staging DB dumps (gitignored)                                   |
| `docs/`, `prompts/` | Local-only notes and AI prompt drafts (gitignored — see `.gitignore`) |

## Scripts

### `db/`

| Script               | What it does                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `db/tunnel.sh`       | SSM port-forward to staging RDS via an ECS task. Postgres available at `localhost:5433`.                                 |
| `db/pull-staging.sh` | Dump staging DB and restore into local. Supports `--target dev\|stg-debug`, `--use-dump`, `--list-dumps`.                |
| `db/migrate.sh`      | Run Prisma migrations against local or staging (avoids the mastra-table drift reset that `prisma migrate dev` triggers). |

### `staging/`

| Script                        | What it does                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `staging/wake.sh`             | Start or stop staging ECS services on demand. Auto-toggles maintenance mode.      |
| `staging/maintenance-mode.sh` | Toggle the maintenance page (writes/clears `maintenance.json` in the CDN bucket). |

### `stripe/`

| Script                    | What it does                                                            |
| ------------------------- | ----------------------------------------------------------------------- |
| `stripe/sync-products.sh` | Sync Stripe products/prices with the DB plan catalog (local + staging). |

### `dev/`

| Script              | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `dev/sally-dev.sh`  | Open iTerm2 tabs running backend + web + console with custom ports. |
| `dev/install.sh`    | One-time project bootstrap (run from repo root).                    |
| `dev/setup-osrm.sh` | Download US road data for OSRM (route planner). One-time setup.     |
| `dev/kill-port.sh`  | Kill the process holding a given port.                              |

## Common tasks

```bash
# Debug a staging issue locally
pnpm stg-debug:up                  # parallel postgres + redis on :5434/:6380
pnpm stg-debug:pull -- -y          # pull staging data into stg-debug DB
pnpm doppler:backend:stg-debug     # run backend against the stg-debug stack

# Open SQL client to staging
./tools/db/tunnel.sh               # then connect to localhost:5433

# Pull staging into your dev DB (replaces local data)
./tools/db/pull-staging.sh -y

# Replay a saved staging snapshot (no tunnel needed)
./tools/db/pull-staging.sh --list-dumps
./tools/db/pull-staging.sh --use-dump tools/.dumps/<file> -y

# Local migrations (use this, not `prisma migrate dev`)
./tools/db/migrate.sh --env local --migrate-only -y

# Toggle staging maintenance page
./tools/staging/maintenance-mode.sh on "Deploying — back in 5"
./tools/staging/maintenance-mode.sh off

# Wake/sleep staging ECS
./tools/staging/wake.sh start
./tools/staging/wake.sh stop
```

## Conventions

- Scripts are language-agnostic operator tooling. TypeScript scripts that need the backend dep graph (Prisma client, NestJS bootstrap) live in `apps/backend/scripts/` instead — e.g. `tenant-reset/`.
- Path-relative paths inside scripts compute `TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"` so subfolders can reach repo root via `$TOOLS_DIR/..`.
- Dumps land in `tools/.dumps/` (gitignored) regardless of which `db/*.sh` script writes them.
