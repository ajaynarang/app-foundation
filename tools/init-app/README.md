# init-app

Turns the `app-foundation` template into **your** app in one command — renames packages,
docker containers, Terraform project, Doppler projects, observability service names,
branding, and tenancy defaults, repo-wide.

```bash
# one-liner (non-interactive)
pnpm init-app --name acme-crm --display-name "Acme CRM" --yes

# or answer prompts
pnpm init-app

# see what would change without changing anything
pnpm init-app --name acme-crm --yes --dry-run
```

## Flags

| Flag             | Default                   | Meaning                                                                                                           |
| ---------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--name`         | _(required with `--yes`)_ | Kebab-case app slug, e.g. `acme-crm`                                                                              |
| `--display-name` | Title-cased name          | Human-facing name shown in the UI, e.g. `"Acme CRM"`                                                              |
| `--scope`        | `@app`                    | Workspace package scope. Keeping `@app` is safest — renaming it rewrites every import and requires `pnpm install` |
| `--db`           | name with `-` → `_`       | Postgres database name                                                                                            |
| `--tenancy`      | `mt`                      | `mt` (multi-tenant) or `st` (single-tenant) — sets the `MULTI_TENANT` defaults in `.env.example` files            |
| `--mobile`       | `yes`                     | `yes` keeps the Flutter companion app (renames `app_mobile` → `<name>_mobile`); `no` deletes `apps/mobile`        |
| `--yes`          | off                       | Non-interactive; accept defaults for anything not passed                                                          |
| `--dry-run`      | off                       | Print per-rule replacement counts; write nothing                                                                  |
| `--force`        | off                       | Skip the git-clean and already-initialized guards                                                                 |

## What it renames

| Pattern                                         | Becomes          | Where                                                                           |
| ----------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `app-foundation`                                | `<name>`         | package names, README, CLAUDE.md, landing page                                  |
| `app-backend` / `app-frontend` / `app-console`  | `<name>-*`       | Doppler projects (`doppler.yaml`, scripts), OTel/Grafana service names, compose |
| `app-postgres` … `app-inngest`                  | `<name>-*`       | docker container names                                                          |
| `__PROJECT__` + terraform `var.project` default | `<name>`         | `infra/`                                                                        |
| postgres db `app`                               | `<db>`           | `DATABASE_URL`, `POSTGRES_DB`                                                   |
| branding `Platform`                             | `<display-name>` | web/console layout metadata, login, landing page (targeted files only)          |
| `MULTI_TENANT` / `NEXT_PUBLIC_MULTI_TENANT`     | per `--tenancy`  | `.env.example` files                                                            |
| `@app/`                                         | `<scope>/`       | only when `--scope` differs from `@app`                                         |
| flutter `app_mobile`                            | `<name>_mobile`  | `apps/mobile` (pubspec, bundle ids, imports) — only with `--mobile yes`         |

Never touched: `.git`, `node_modules`, `pnpm-lock.yaml` (regenerate with `pnpm install`),
`docs/superpowers/` (historical design docs), **`packages/foundation/` package names**
(`@appshore/*` is the platform brand, not your app), and this tool itself.

## Safety

- Refuses to run on a dirty working tree (review the rename as one clean diff).
- Refuses to run twice (detects the root package name is no longer `app-foundation`).
- `--dry-run` first if you're unsure.

After it finishes, follow the printed next steps; once you're happy, you can delete
`tools/init-app/` entirely.
