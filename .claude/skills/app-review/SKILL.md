---
name: app-review
description: Use when reviewing any code change in this monorepo — uncommitted changes, a branch, a pull request or a file. Runs the guards first, checks the pnpm verify line against the head commit, then fans the review out to app-reviewer agents, one per dimension, so no reviewer is spent on a rule a machine already holds.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
owner: foundation
guards:
  - script:guards
  - script:verify:arch
  - script:lint
---

# Code review

You run the review of one change. The rules live in `app-conventions` and its references; each reference ends with
"Flag in review", the list of what no guard sees. This skill holds no rule text: it decides what runs, in what order,
and merges the verdicts.

**Command:** $ARGUMENTS

## Phase 1 — Scope

| Input         | Mode              | The diff                           |
| ------------- | ----------------- | ---------------------------------- |
| _(empty)_     | Uncommitted       | `git diff` + `git diff --cached`   |
| `branch`      | Branch vs default | `git diff <default-branch>...HEAD` |
| `pr <number>` | Pull request      | `gh pr diff <number>`              |
| `file <path>` | One file          | read the file                      |

The default branch is `defaultBranch` in `.claude/workflow.json`. Classify every changed file: backend
(`apps/backend/`, `packages/appshore/{kernel,db,platform}/`, `packages/shared-types/`), web (`apps/web/`,
`packages/appshore/web-core/`, `packages/ui/`), mobile (`apps/mobile/`), infra and ops (`infra/`, `.github/`,
`tools/`, `docs/runbooks/`), tests (`tests/`), docs and skills (`docs/`, `.claude/`, `CLAUDE.md`). PR mode reviews
every file in the PR in full; the other modes review changed areas in depth and the rest for critical issues only.

## Phase 2 — Machines first

Run these before any reviewer. Every failure is a finding with the guard's own message; no reviewer re-derives it.

```bash
pnpm guards          # skills, docs and source citations; CI triggers; the convention gate
pnpm lint            # scope with --filter for a one-package change
pnpm verify:arch     # the architecture specs and the web guard tests
```

In PR mode also check the record:

- The PR body carries a `pnpm verify` result line. Its sha must equal the PR's head commit
  (`gh pr view <n> --json headRefOid`, first seven characters), with no `+dirty`. Missing, stale or dirty is a
  finding, and the review verdict cannot be READY or CLEAN.
- A wire change (controller, DTO, serializer, status code, error envelope) carries a `pnpm verify:api` line; a
  scaffolding change (`tools/init-app/`, a feature manifest, a skill or agent name, the residue list, a Desk-only line
  outside the Desk folder) carries a `pnpm verify:scaffold` line.
- A route, DTO or response change includes the regenerated `apps/backend/openapi.json` and `public-openapi.json`.
- The PR template's Docs, Conventions and Decision record sections are filled; a convention change updates its
  reference in the same PR; code that contradicts a binding doc or ADR with no amendment is a finding.

## Phase 3 — Fan out by dimension

Dispatch one `app-reviewer` agent per relevant dimension, all in one message so they run at once. The agent carries
the dimension definitions and the report shape; the prompt names only the dimension, the mode and the diff:

```
Agent(subagent_type: "app-reviewer",
      prompt: "Dimension: <name>. Mode: <full|tiered>. Review <pr N | branch | paths>.
               Guards already run and their findings are known: <list or 'none'>; do not repeat them.")
```

| Dimension       | Dispatch when                                                   |
| --------------- | --------------------------------------------------------------- |
| `correctness`   | always                                                          |
| `conventions`   | always (only what the guards cannot see)                        |
| `authz-tenancy` | a controller, service, guard, query, tool or job changed        |
| `contract`      | a route, DTO, serializer, event, webhook or tool schema changed |
| `tests`         | any source changed                                              |
| `performance`   | a query, list, job, cache or hot path changed                   |
| `ui`            | `apps/web/`, `packages/ui/` or web-core changed                 |
| `mobile`        | `apps/mobile/` changed (and the product has it)                 |
| `domain`        | the product's domain skill exists and the diff touches a domain |

For a change to auth, the tool pipeline, billing, the outbox or deadlines, run `correctness` twice with different
framings and keep only the findings that survive both.

## Phase 4 — Merge, verify, act

1. **Merge** the agents' findings; drop duplicates and anything a guard already reported.
2. **Spot-check** at least one finding per agent yourself: open the file, confirm the failure scenario. A finding
   whose scenario does not hold is dropped.
3. **Auto-fix** a MINOR finding only when the fix is unambiguous and cannot change behaviour (a theme token for a
   palette class, a NestJS exception for `throw new Error(` on an HTTP path, an import from `@appshore/db`). Then run
   the scoped `pnpm lint` and the guards again. Anything else is reported, not fixed.
4. **Report**, in this order: a header (mode, files reviewed by area); the verify line and whether it matches the
   head commit (matches, stale, missing, dirty); the guards' result; **Critical — must fix** (each: title,
   `file:line`, the concrete failure, what to do); **Important**; **Auto-fixed** (`file:line`, before and after);
   **Minor and suggestions**; and a **Verdict**, one of:
   - BLOCKED — a critical finding, or the verify line is missing, stale or dirty;
   - READY — no critical finding; the auto-fixes and suggestions listed;
   - CLEAN — nothing found.

In PR mode, post the report as a PR comment (`gh pr comment <n> --body-file <file>`), so a fresh session or the
`app-epic` merge gate can see the verdict on GitHub.

## Always

- Read `app-conventions` and the references the diff touches fresh; they change.
- A finding needs a file, a line and a concrete failure. Unsure is a suggestion, never critical.
- Log lines, metric labels and error reports are judged against `docs/standards/observability.md`.
- Never spend a reviewer on what a guard holds. When a reviewer keeps finding the same thing a machine could catch,
  say so in the report: it is a candidate guard (`app-standards-audit`).
