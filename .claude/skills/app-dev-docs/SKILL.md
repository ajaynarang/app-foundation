---
name: app-dev-docs
description: Use before opening any pull request (mode slice), at an epic's close-out (mode epic), or when the docs have drifted (mode audit) — "update the docs", "the docs are stale", "refresh dev docs". Keeps the binding docs, ADRs, README.md, CLAUDE.md and the app-conventions references true to the code, and runs the docs guard.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
owner: foundation
guards:
  - script:guard:docs
  - script:guard:skills
---

# Developer docs

The docs are Markdown in the repo: the binding docs and ADRs (the "Binding docs" table in `CLAUDE.md`), `README.md`,
`CLAUDE.md`, the other files under `docs/` (indexed in `docs/README.md`), the tools READMEs, and the
`app-conventions` index and references. A doc is amended in the same pull request as the code it describes, never
later and never silently (the amendment rule in `CLAUDE.md`).

**Mode:** $ARGUMENTS — `slice` (default), `epic` or `audit`.

## Two markers, read by the guards and the hooks

- **`sources:`** in a doc's or reference's frontmatter lists the files it describes (`path` or `path#Symbol`). The
  skills guard fails when one is missing or an anchored symbol is gone; the drift reminder hook names the doc after
  an edit to one of its sources. A bare folder entry is checked for existence but does not trigger the reminder.
- **`verified: <sha>`** is the commit a hand-written doc was last checked against, claim by claim. A doc with no
  `verified:` line, or a sha git does not know (`git cat-file -e <sha>^{commit}` fails), counts as never verified.
  Set it to a commit that is on the default branch: `git merge-base HEAD origin/<default-branch> | cut -c1-7`. A
  branch sha disappears with a squash merge.

## `slice` — before every pull request

1. List the diff: `git diff --name-only origin/<default-branch>...HEAD` (`defaultBranch` in `.claude/workflow.json`).
2. Update what the diff makes untrue, using this table. Read the source for every claim you write.

   | You changed                                                                   | Update                                                                                         |
   | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
   | a Prisma model or relation (`packages/appshore/db/prisma/schema/`)            | `docs/domain-map.md`                                                                           |
   | an enum value, a status, a transition, an invariant                           | `docs/lifecycles-and-invariants.md`                                                            |
   | an event in `APP_EVENT_REGISTRY`                                              | `docs/event-vocabulary.md`                                                                     |
   | a new domain, feature folder or package, or an import arrow between domains   | `docs/module-map.md` (and `apps/backend/src/architecture/domain-boundaries.allowed.json`)      |
   | a decision that is expensive to undo, or one an ADR records                   | a new ADR from `docs/adr/0000-template.md`, or a dated amendment; the index in its README      |
   | an epic's scope or "demoable when"                                            | `docs/epics.md`                                                                                |
   | a convention (a rule, its guard, a recipe)                                    | its `app-conventions` reference, or the index's non-negotiables                                |
   | a root script, port, env var, setup step or extension point                   | `README.md`, `CLAUDE.md` (quick start, extension points, gates), `docs/doppler.md`             |
   | the config schema or an `.env.example`                                        | `docs/doppler.md`                                                                              |
   | deploy, migrations, the outbound gate, an operator procedure, a workflow file | `docs/operations.md`; a new alert rule's section in `docs/runbooks/`                           |
   | logging, metrics, traces, error reporting                                     | `docs/observability.md`, `docs/standards/observability.md`                                     |
   | a guard, hook, gate step or skill                                             | `CLAUDE.md` ("Gates", "Workflow"), `docs/how-we-build.md`, `tools/guards/` or the tools README |
   | a file a doc's or reference's `sources:` names                                | that doc or reference (the drift reminder names it)                                            |

3. Bump `verified:` on each hand-written doc you re-checked in full. Do not bump a doc you only touched in passing.
4. Run `pnpm guard:docs` and `pnpm guard:skills`. A dead link or a missing path is fixed, never excluded. A file
   deleted on purpose is named as ~~`path`~~ in an upgrade note.
5. Commit the docs with the code. The PR body's "Docs" section lists the files changed, or "none, because …".

## `epic` — at an epic's close-out

`slice`, then:

- `docs/epics.md`: mark the epic done with the date, a one-line outcome and its PRs; record each follow-on slice.
- Re-read every binding doc the epic touched end to end; fix what the slices left stale; bump `verified:`.
- `docs/how-we-build.md`: amend the playbook if the epic changed how work is done (a new gate, a new step).

## `audit` — scheduled, or "the docs are stale"

Work in a fresh worktree off the default branch (`git worktree add .worktrees/docs-audit origin/<default-branch>`).

1. For each hand-written doc with `sources:`, run `git log --oneline <verified>..HEAD -- <its sources>`. With no
   `verified:` or an unknown sha, treat every source as changed.
2. Re-verify each doc whose sources moved, claim by claim, against the code. Record the ledger (claim, source file,
   verdict) in `<plans>/<YYYY-MM-DD>-docs-audit.md` (`<plans>` is `plans.folder` in `.claude/workflow.json`).
3. Check `README.md` and `CLAUDE.md` against the same code, and every row of the binding docs table.
4. One pull request with the fixes and the bumped `verified:` lines. A fresh-context reviewer (`app-reviewer`,
   dimension `conventions`) samples claims before merge.

## Always

- Every concrete claim (a port, a path, a script, a package, an env var, a route, a workflow name) is checked in
  source in this session. If it cannot be checked, leave it out.
- A convention claim cites the `app-conventions` reference that states it; never copy the rule into a doc.
- No product names from elsewhere, no home paths, no secrets, no model ids in a doc. Model ids live in the model
  catalog in code.
- Plans, specs and ledgers stay in the plans folder; nothing from it is quoted into a tracked doc while
  `plans.tracked` is `false`.
