# tools/

Operator scripts and dev utilities. Not application code — these are invoked by humans (or CI) to set up, debug, deploy, or maintain the platform.

## Layout

| Folder      | Purpose                                             |
| ----------- | --------------------------------------------------- |
| `init-app/` | One-time template rename (see `init-app/README.md`) |
| `db/`       | Database tunnel and migrations                      |
| `dev/`      | Local dev environment helpers                       |
| `.dumps/`   | Saved DB dumps (gitignored)                         |

## Scripts

### `init-app/`

| Script                  | What it does                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `init-app/init-app.mjs` | Renames the template (package scope, project name, infra prefix). Run via `pnpm init-app`. |

### `db/`

| Script          | What it does                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `db/tunnel.sh`  | SSM port-forward to the staging RDS via a running ECS task. Postgres available at `localhost:5433`.                           |
| `db/migrate.sh` | Run Prisma migrations against local or staging (staging opens an SSM tunnel first; avoids `prisma migrate dev` drift resets). |

### `dev/`

| Script             | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `dev/app-dev.sh`   | Open iTerm2 tabs running backend + web + console with custom ports. |
| `dev/install.sh`   | One-time project bootstrap (run from repo root).                    |
| `dev/kill-port.sh` | Kill the process holding a given port.                              |

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
