# ADR-0019 — Products follow the foundation by version, through a manifest of owned paths

**Date:** 2026-11-15 · **Status:** Adopted.

## Context

A product is a copy of this starter, made by `pnpm init-app`. After that day nothing said which starter version the
product came from, or which of its files were still the foundation's. Improvements moved between repositories by
hand, in both directions, and each product drifted from the others.

Two facts rule out the obvious answers:

- **`git merge` from the template only works with shared history.** A product created with a fresh `git init` (the
  usual case, and what the `defaults` variant of `pnpm verify:scaffold` does) has none.
- **A product's text differs from the template's by its renames.** init-app rewrites the app name, the skill prefix
  and the database name, and removes the optional features the product declined. A plain file comparison with the
  template reports all of that as change.

Publishing the foundation as versioned packages would cover `packages/appshore/*` only. Half of what the foundation
keeps in step is application code a package cannot hold: `apps/backend/src/domains/ai`, `domains/desk`,
`platform-glue`, the web app's shared layer, the skills, the guards. And `@appshore/db` holds each product's own
`app.prisma` and migrations.

## Decision

**The foundation carries a version and a manifest of the paths it owns; a product records the version and commit it
was scaffolded from, and is compared with that base as rebuilt by init-app itself.**

- **`foundation.json` at the repository root** holds `version`, `template` (the template's git URL), `owned` (globs
  the foundation keeps in step), `seams` (files inside an owned area that every product fills in), and `base` and
  `scaffold`, which are null in the template. Its shape is held by `tools/foundation/manifest.mjs`
  (`tools/foundation/manifest.test.mjs`).
- **Three classes of file.** Owned: a change in a product is worth offering back, and a newer foundation replaces
  it. Seam: the product's, never compared or overwritten (`app.prisma`, the event registry, the tool module, the
  product's domain skill). Everything else is starter content: shipped once, the product's from then on.
- **The manifest stays true to the tree.** In the template every owned and seam glob matches a tracked file, every
  seam sits inside an owned glob, and `package.json` carries the same version
  (`tools/foundation/foundation-json.test.mjs`, a step of `pnpm verify`).
- **init-app records the base as its last step:** the template version, the commit when the checkout still has the
  template's history, and the answers it was given. The template URL and the globs keep their template names.
  Held by `scaffoldProblems` in `tools/init-app/check-variants.mjs` on all three variants.
- **The base is rebuilt, not approximated.** `tools/foundation/base.mjs` fetches the base commit (or the tag
  `v<version>`), checks it out into a temp folder and runs that version's own init-app with the recorded answers.
  There is no second copy of the rename rules to drift. Held by `tools/foundation/status.test.mjs` on fixture
  repositories, and by `tools/init-app/check-variants.test.mjs`: a fresh scaffold of each variant is in step with its
  base, and one edit to an owned file is the one thing listed.
- **`pnpm foundation:status`** lists the owned files a product changed, deleted or added, and writes nothing. For
  Markdown it sets aside what Prettier changes after a scaffold (table alignment, doubled blank lines).
- **A release is a version bump in `foundation.json` and `package.json`, an entry under `docs/upgrade-notes/` when a
  product must act, and a tag `v<version>` on the merge commit.** Review only: a tag is pushed by the owner.

## Consequences

- A product knows where it stands in seconds, without the template checked out beside it.
- Pulling a newer foundation and offering a product's change back both build on this: the same manifest says which
  files are in play, and the same rebuild gives the three sides of a merge (base, theirs, ours) with the renames
  already applied.
- A new top-level area in the template is starter content until someone adds it to `owned`. That is deliberate: the
  list is a decision, not a default.
- A product that changes its app name, scope or skill prefix after scaffolding must update `scaffold` in
  `foundation.json`, or every renamed file shows as changed.
- Products scaffolded before this record have no `foundation.json`. Each is adopted once, by writing the file with
  the nearest base; that work is outside this record.
- Left out on purpose: publishing `@appshore/*` to a registry. It can be added later for products that never touch
  those packages; the manifest would then stop listing them.
