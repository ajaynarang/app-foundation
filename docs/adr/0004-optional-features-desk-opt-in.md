# ADR-0004 — Optional features: Desk is opt-in at scaffold time

**Date:** 2026-11-12 · **Status:** Adopted.

## Context

Desk is the starter's durable workflow engine for background AI agents: responsibilities, episodes, approvals and
memory, orchestrated by Inngest. Every product scaffolded from the starter got all of it: the code, its routes, its
seed rows, a local Inngest service, its env keys and its docs. Most products never use it. They still paid for it in
build time, in an extra service to run, in routes to keep under the API contract, and in an assistant that reads
Desk docs and reaches for Desk when a timer or a queue job would do.

Two things made it removable. A plain timer no longer needs a workflow engine (ADR "Outbox and deadlines": a timer
is a row). And Desk was already at the edge: only three app files reached into it, and nothing in the foundation
packages imports it.

A separate package was not an option yet: Desk imports app-side AI and prompting code.

## Decision

**Desk is off by default and chosen at scaffold time.** `pnpm init-app` asks; `--desk yes|no` answers without the
question, and `--yes` alone means no. The starter repo itself keeps Desk, so its code is compiled and tested here.

**The seam and the manifest are the only way a feature is removed.**

- The seam is `apps/backend/src/platform-glue/features/`. `<name>.feature.ts` is the one file outside the feature's
  folder that imports its code; `OPTIONAL_FEATURES` in `index.ts` lists what the product kept, and is the only
  record of that choice. The app module spreads the features' modules, `hooks.module.ts` binds
  `TENANT_PROVISION_HOOKS` to a composite of their hooks (a no-op with none), and `main.ts` calls each feature's
  `onAppReady`.
- The manifest is `tools/init-app/features/<name>.json`. It names everything else the feature brings: files and
  folders (`paths`), files holding blocks between `feature:<name>:start` and `feature:<name>:end` comment lines
  (`markers`), JSON keys and array values (`jsonEntries`), and allowlist entries under the feature's folder
  (`allowlistPrefixes`). `tools/init-app/apply-feature.mjs --remove <name>` strips all of it, and is safe to run
  again.
- A line that must stay in every product and still names Inngest or the Desk folder (a production guard on an env
  key, a decision record, a guard that tests whether the folder exists) is listed with its reason in
  `tools/init-app/features/desk.residue.json`.

**The Desk tables stay, empty.** Removing Desk does not touch `foundation.prisma` or any migration. The seven Desk
models and their enums stay in the schema, the generated client and the shared enum mirror; nothing writes to them,
because the seed, the tenant-provision hook and the routes are gone. Every product keeps one migration history, so
template migrations keep applying cleanly. A product that wants the tables gone writes its own drop migration and
accepts a conflict on any later template change to those models. The starter never ships that migration.

**Adding Desk later is a written procedure, not a script.** The steps are in the "Optional features" section of
[`tools/init-app/README.md`](../../tools/init-app/README.md). No migration is needed, because the tables never left.

## What holds it

- `apps/backend/src/architecture/optional-features.spec.ts`, in the pre-push hook: no backend file imports a
  feature's code outside its seam; a kept feature has every path, block and entry of its manifest; a dropped one
  has none; every file with a feature marker is listed in the manifest.
- `pnpm verify:scaffold` (`tools/init-app/check-variants.mjs`, also the manual `scaffold-variants` CI job):
  scaffolds the repo with and without Desk, installs, regenerates OpenAPI and the RBAC matrix, type-checks the
  backend, web and `tests/`, runs the backend specs, and fails on any mention of Inngest or the Desk folder that is
  not on the residue list, or a residue entry that no longer matches. It takes minutes, so it runs before a pull
  request that touches the seam, the manifest, or a file the manifest names, not on every push.

## Consequences

- A Desk change stays inside `apps/backend/src/domains/desk/`. A Desk-only line outside it goes between markers and
  into the manifest in the same pull request; the spec fails otherwise.
- A product without Desk that pulls template updates gets Desk files back as modify-or-delete conflicts. It runs
  `apply-feature.mjs --remove desk` again, which deletes what came back and strips any new marked block.
- `FEATURE_KEYS.DESK` stays in shared types so foundation types compile. Without Desk it is a key with no
  feature-flag row and no plan entitlement, so no plan page or upgrade prompt offers it.
- The committed OpenAPI documents and RBAC matrix list Desk routes; `init-app` regenerates them when it can, and
  `swagger-completeness.spec.ts` names the command when a product forgets.
- The next optional feature (the mobile app is the obvious one) adds a manifest and, if it has backend code, a seam
  file. Nothing in the spec or `apply-feature.mjs` is written for Desk alone.
