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

# every option as JSON (name, question, choices, default), for a tool that asks them
pnpm init-app --describe
```

## Flags

| Flag             | Default                   | Meaning                                                                                                                                      |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--name`         | _(required with `--yes`)_ | Kebab-case app slug, e.g. `acme-crm`                                                                                                         |
| `--display-name` | Title-cased name          | Human-facing name shown in the UI, e.g. `"Acme CRM"`                                                                                         |
| `--scope`        | `@app`                    | Workspace package scope. Keeping `@app` is safest — renaming it rewrites every import and requires `pnpm install`                            |
| `--db`           | name with `-` → `_`       | Postgres database name                                                                                                                       |
| `--tenancy`      | `multi`                   | `multi`, `single` or `personal` (`mt` and `st` still work) — sets `TENANCY_MODE` and the `MULTI_TENANT` defaults in `.env.example` files     |
| `--mobile`       | `yes`                     | `yes` keeps the Flutter companion app (renames `app_mobile` → `<name>_mobile`); `no` removes it through `features/mobile.json`               |
| `--desk`         | `no`                      | Include Desk, the Inngest workflow engine for background AI agents. `no` strips it (see "Optional features")                                 |
| `--skill-prefix` | see below                 | Your skills and agents become `<prefix>-<name>` (2 to 12 lowercase letters or digits; never a reserved name)                                 |
| `--plans`        | `tracked`                 | `tracked` takes the plans folder out of `.gitignore`; `untracked` keeps it ignored. Recorded in `.claude/workflow.json` either way           |
| `--repo-url`     | the git remote `origin`   | Your repository (`https://github.com/<org>/<repo>`). Alert runbook links point there. Ignored when `origin` is the template's own repository |
| `--yes`          | off                       | Non-interactive; accept defaults for anything not passed                                                                                     |
| `--dry-run`      | off                       | Print per-rule replacement counts; write nothing                                                                                             |
| `--force`        | off                       | Skip the git-clean and already-initialized guards                                                                                            |
| `--describe`     | off                       | Print every option as JSON and exit                                                                                                          |

The default skill prefix: the name when it is one word of at most 8 characters (`acme` gives `acme`), the initials of
its words when it has several (`acme-crm` gives `ac`), the first three letters of one longer word (`throughline`
gives `thr`). The interactive run offers it and accepts another.

## What it renames

| Pattern                                         | Becomes                 | Where                                                                                                                                                   |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-foundation`                                | `<name>`                | package names, README, CLAUDE.md, landing page                                                                                                          |
| `app-backend` / `app-frontend`                  | `<name>-*`              | Doppler projects (`doppler.yaml`, scripts), OTel/Grafana service names, compose                                                                         |
| `app-postgres` … `app-inngest`                  | `<name>-*`              | docker container names                                                                                                                                  |
| `__PROJECT__` + terraform `var.project` default | `<name>`                | `infra/`                                                                                                                                                |
| postgres db `app`                               | `<db>`                  | `DATABASE_URL`, `POSTGRES_DB`                                                                                                                           |
| branding `Platform`                             | `<display-name>`        | web layout metadata, login, landing page (targeted files only)                                                                                          |
| `MULTI_TENANT` / `NEXT_PUBLIC_MULTI_TENANT`     | per `--tenancy`         | `.env.example` files                                                                                                                                    |
| `@app/`                                         | `<scope>/`              | only when `--scope` differs from `@app`                                                                                                                 |
| flutter `app_mobile`                            | `<name>_mobile`         | `apps/mobile` (pubspec, bundle ids, imports) — only with `--mobile yes`                                                                                 |
| Grafana-as-code `PROJECT` / `REPO_URL`          | `<name>` / `--repo-url` | `infra/observability/grafana-cloud/catalog/constants.mjs`; then `generate.mjs` regenerates the alerting and dashboard files (or the command is printed) |

## The order of one run

1. Optional features you said no to are removed through their manifests (below), against template text.
2. The prune step removes the skill files that require a removed feature.
3. The skill prefix: each folder under `.claude/skills/` and each file under `.claude/agents/` named `app-<x>` becomes
   `<prefix>-<x>`, and exactly those names are replaced, as whole tokens, in every text file the rename visits. Source
   code under `apps/`, `packages/`, `infra/` and `tests/` is left alone (Markdown there is not): a source file never
   cites a skill, so a token there that looks like one is an identifier (the Desk Inngest client's app id is
   `app-desk`).
4. The renames in the table below.
5. `.claude/workflow.json` is written for the product: the prefix, the reserved names for your app name (the names
   the renames produce, such as `<name>-backend`), and the plans choice. With `--plans tracked` the plans folder
   leaves `.gitignore`. Every `verified: <sha>` line leaves the docs' frontmatter: the template's commits are not in
   your history, and a doc with no `verified:` line counts as never verified until `/<prefix>-dev-docs audit` checks it.

Renaming skills can leave a Markdown table out of alignment; run `pnpm exec prettier --write .claude docs` after
`pnpm install`.

Never touched: `.git`, `node_modules`, `pnpm-lock.yaml` (regenerate with `pnpm install`),
the plans folder, docs/superpowers by default (design history), git worktrees under `.worktrees/` and `.claude/worktrees/`,
**`packages/appshore/` package names**
(`@appshore/*` is the platform brand, not your app), and this tool itself.

## Safety

- Refuses to run on a dirty working tree (review the rename as one clean diff).
- Refuses to run twice (detects the root package name is no longer `app-foundation`).
- `--dry-run` first if you're unsure.

After it finishes, follow the printed next steps. Keep `tools/init-app/` if you plan to pull template updates:
`apply-feature.mjs` is how a returning file of a feature you dropped is removed again.

## Optional features

A feature you choose at scaffold time. Today there is one, **Desk**: the durable workflow engine (Inngest) for
background AI agents, with approvals and memory. It is off by default. Timers, recurring jobs and the event outbox
work without it. The decision is the ADR "Optional features: Desk is opt-in at scaffold time" (`docs/adr/`).

How a feature is cut out:

- **The seam.** The backend reaches a feature's code only through `apps/backend/src/platform-glue/features/`:
  `desk.feature.ts` imports Desk, and `OPTIONAL_FEATURES` in `index.ts` lists what you kept.
- **The manifest.** [`features/desk.json`](features/desk.json) names everything else Desk brings: `paths` (deleted),
  `markers` (files holding blocks between `feature:desk:start` and `feature:desk:end` comment lines, stripped),
  `jsonEntries` (the package scripts and the `inngest` dependency), and `allowlistPrefixes` (allowlist
  entries under the Desk folder).
- **The residue list.** [`features/desk.residue.json`](features/desk.residue.json) names each file that still
  mentions Inngest or the Desk folder after removal, and why it stays.

```bash
node tools/init-app/apply-feature.mjs --list desk              # everything the manifest covers, with each block's text
node tools/init-app/apply-feature.mjs --remove desk --dry-run  # what removing would change
node tools/init-app/apply-feature.mjs --remove desk            # remove it (safe to run twice)
```

`pnpm init-app --desk no` runs the same removal before its renames, so the manifest always matches template text.

### Mobile

The Flutter companion app is the second optional feature. [`features/mobile.json`](features/mobile.json) lists
`apps/mobile`, the `mobile` job in `ci.yml`, the `mobile:*` root scripts and the `feature:mobile` blocks in the docs.
Mobile has no backend seam, so its manifest carries `presentWhen: "apps/mobile"`: `optional-features.spec.ts` counts
it as kept while that folder exists, instead of reading `OPTIONAL_FEATURES`. `--mobile no` runs
`apply-feature.mjs --remove mobile`; so does a product that said no and later pulls the template.

A few mentions stay where a marker would break the Markdown (a table row, a line inside a fenced block, mid-sentence):
the `apps/mobile` rows of `docs/WHAT-YOU-GET.md`, the structure block in `CLAUDE.md`, the README's app list and
diagram. They describe the template; edit them by hand.

### The prune step

Skills, references, agents and hotspot files are never listed in a manifest (a skill rename would break the path).
Instead, a file that belongs to a feature says so: frontmatter `requires: desk` (or `mobile`), or a hotspot file
named after the feature (`.claude/hooks/hotspots/<feature>.json`). Right after the manifests run, init-app runs [`prune-requires.mjs`](prune-requires.mjs): it deletes every such
file whose feature folder (`apps/mobile`, the Desk folder) is gone, and removes each row of a skill's table that
linked to a file that no longer exists. It reads the disk only, so it does not care how the feature was removed. The
skills guard (`pnpm guards`) fails on a `requires:` file whose folder is absent, so a file that comes back with a
template update is caught on the next commit.

### What stays without Desk

- **The tables.** The seven Desk models and their enums stay in `foundation.prisma`, the generated client and the
  shared enum mirror, empty: no seed, no tenant hook and no route writes to them. Every product keeps the
  template's one migration history. If you want them gone, write your own migration that drops them and remove the
  models from `foundation.prisma`; expect a conflict on any later template change to those models. The template
  never ships that migration.
- `FEATURE_KEYS.DESK` in shared types (a key with no flag row and no plan entitlement), the Desk event names in the
  kernel catalog, the `desk_responsibility` principal kind, the `DESK_MEMORY_EXTRACT` prompt key, and the
  production check that refuses `INNGEST_DEV`. The residue list has the full set.

### Pulling template updates without Desk

A template change inside the Desk folder arrives as a modify-or-delete conflict. Run
`node tools/init-app/apply-feature.mjs --remove desk` again: it deletes what came back and strips any new marked
block. Then regenerate the OpenAPI documents and the RBAC matrix (below).

### Adding Desk later

Not scripted, and not covered by `pnpm verify:scaffold`. The tables never left, so no migration is needed.

1. Add the template as a remote and fetch it: `git remote add template <template-url> && git fetch template`.
2. Restore every path in `features/desk.json` `paths`:
   `git checkout template/main -- apps/backend/src/domains/desk apps/backend/src/platform-glue/features/desk.feature.ts …`
   (all of them).
3. Put back what `node tools/init-app/apply-feature.mjs --list desk` prints, reading it on a checkout of the
   template (`git worktree add ../template-ref template/main`): each marked block in its file, each JSON entry, and
   each allowlist entry under `apps/backend/src/domains/desk/`. The block in
   `apps/backend/src/platform-glue/features/index.ts` is what switches Desk on.
4. Apply your own rename to the restored files: the package scope if you changed it, and container names
   (`app-inngest` → `<name>-inngest`).
5. `pnpm install`, then build the foundation packages and regenerate:
   `pnpm --filter @app/backend openapi:generate` and `pnpm --filter @app/qa generate:rbac`.
6. Seed (`pnpm --filter @appshore/db db:seed`) to add the `desk` feature flag and plan rows. Existing tenants get
   Tenants approved from then on get their default Desk agents; for tenants that already exist, call
   `DeskBootstrapService.bootstrapForTenant(tenantId)` once each.
7. `pnpm verify` and `pnpm --filter @app/backend exec jest src/architecture/optional-features.spec.ts` confirm the
   footprint is whole.

### Checking the scaffolds

`pnpm verify:scaffold` (`check-variants.mjs`) copies the repo three times and scaffolds each copy:

| Variant          | Flags                                                                                      | Where it runs                             |
| ---------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `defaults`       | `--name scaffold-check` and nothing else (Desk off, mobile on, prefix `sc`, plans tracked) | inside a fresh `git init`, then committed |
| `lean`           | `--mobile no --desk no --tenancy single --skill-prefix zz`                                 | with no `.git` folder at all              |
| `desk-untracked` | `--name scaffoldcheck --desk yes --plans untracked` (prefix `sca`)                         | with no `.git` folder                     |

Each copy then gets the cheap checks (the prefix, reserved names and plans in `.claude/workflow.json`, the
`.gitignore` plans line, no `verified:` line left, the alert catalog, the runway's starter check, each feature
manifest fully kept or fully removed), then installs, builds the foundation packages, regenerates OpenAPI and the
RBAC matrix, type-checks the backend, web, `packages/test-utils` and `tests/`, migrates, and runs the backend specs.
After those: `pnpm guards`, `pnpm test:guards`, `pnpm test:hooks`, and a search for every template skill and agent
name (read before the rename), which must be gone. A copy without Desk is also searched for `inngest` and
`domains/desk` (any case): a hit not on the residue list fails, and so does an entry that no longer matches.
`--variant <name>` runs one. Every step runs with git's hook variables cleared, so a run from a git hook can never
reach the repository the hook belongs to.

It needs Postgres and Redis (`DATABASE_URL`, `REDIS_URL`) and takes minutes. Run it before a pull request that
touches `tools/init-app/`, `platform-glue/features/`, a skill or agent name, a file a manifest names, the residue
list, or a Desk file outside the Desk folder, and paste its last line into the pull request.
