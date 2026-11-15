---
name: app-pull-foundation
description: Use when this product should take a newer version of the template it was scaffolded from — "pull the foundation", "update from the template", "take the latest starter", or /app-pull-foundation. Runs the pull on a branch, settles the conflicts, takes what the product needs from the lists the pull never writes, runs the gates and opens a pull request.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill
owner: foundation
guards:
  - script:foundation:pull
  - script:foundation:status
  - script:verify
  - tools/foundation/pull.test.mjs
---

# Pull the foundation

Bring this product's foundation-owned files to a newer template version, keeping what the product changed. The
record is `foundation.json` at the root: `base` is the version this product is on, `owned` the paths the template
keeps in step, `seams` the files inside them that are this product's to fill in.

**Input:** $ARGUMENTS — a version (`0.3.0`), or nothing for the template's default branch.

Run this in a product. In the template itself there is no base and the command says so.

## Step 1 — Branch and look

1. A clean tree on an up-to-date default branch, then `git switch -c chore/foundation-<version>`. Never on the
   default branch.
2. `pnpm foundation:status` — what this product already changed in owned files. These are the files that can
   conflict.
3. `pnpm foundation:pull <version> --dry-run` — what the pull would do. It writes nothing. When the template cannot
   be fetched, pass `--from <path or url>` (a local clone works). A product whose `package.json` has no such script
   yet runs the file: `node tools/foundation/pull.mjs`, or the template's copy with `--root <this repo>`.

Stop and ask when the dry run lists more conflicts than a person can review in one sitting: pull an earlier
version first.

## Step 2 — Pull

```bash
pnpm foundation:pull <version> --keep    # exit 0 clean, 2 when conflicts are left, 1 when it could not run
```

`--keep` leaves the rebuilt base and target on disk and prints both paths: Step 3 compares against them. Remove both
folders when the work is done.

It rewrites owned files only, merges the product's edits three ways, and moves `base` in `foundation.json` to the
new version. One commit undoes it: `git checkout . && git clean -fd` before committing.

## Step 3 — Settle what the pull left

Work through the report top to bottom.

1. **Conflicts.** A file with markers has both sides in it: `here` is this product, `foundation v<version>` is the
   template. Keep the product's intent and the template's fix. Read the template's commit or its upgrade note when
   the reason for its change is not obvious. A file "removed in the foundation, changed here" is kept: delete it
   only when nothing imports it. A file "deleted here" stays deleted unless the newer code needs it.
2. **Seams.** Never written by a pull. For each one listed, `diff <base>/<file> <target>/<file>` shows what the
   template changed: add that to the product's file (a registry entry, a model, an allowlist line). The product's
   own entries stay.
3. **Outside the foundation.** Root `package.json`, the lockfile, compose files, workflows. The same diff shows the
   template's change. Take new or raised dependencies and new scripts the pulled code needs; leave the product's
   own values.
4. **Upgrade notes.** Read each one listed and do what it says before the gates: an env key to set, a migration to
   expect, a behaviour that changed.

No conflict marker may be left: `git grep -n '^<<<<<<< \|^>>>>>>> '` prints nothing.

## Step 4 — Install, regenerate, gates

```bash
pnpm install
pnpm backend:prisma:generate
pnpm --filter @app/backend openapi:generate
pnpm verify
```

Then `pnpm verify:api` when the pulled version changed the wire, as its upgrade note says. A red step is fixed at
its root cause. When the cause is a product change to an owned file, prefer moving that change out of the owned
file (a seam, the product's own module) over carrying the edit forward: every carried edit can conflict again.

## Step 5 — Pull request

Commit as one change (`Take foundation v<version>`), push, and open a pull request that names: the versions (from
and to), each conflict and how it was settled, what was taken into seams and outside the foundation, each upgrade
note acted on, and the last line of `pnpm verify`. Do not merge: the owner merges.

## Stop and correct when

- You are on the default branch, or the tree was dirty before the pull.
- A conflict was settled by taking one whole side without reading the other.
- A seam was overwritten with the template's copy.
- `foundation.json` was edited by hand to move `base` without a pull.
- You are about to say "done" without the `pnpm verify` line for the head commit.
