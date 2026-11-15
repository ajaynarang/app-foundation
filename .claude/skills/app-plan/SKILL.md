---
name: app-plan
description: Use when writing an implementation plan for this monorepo from a spec, design doc or brainstorm output — before touching code. Wraps superpowers:writing-plans, applies app-conventions and its references, requires a Docs section, and files the plan in the plans folder for app-execute.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
owner: foundation
---

# Plan

You are writing an implementation plan. This skill wraps `superpowers:writing-plans` and layers the repo's
conventions on top, so the executor never has to re-derive a decision.

**Input:** $ARGUMENTS — usually the path of a design from `app-brainstorm` (`<plans>/specs/…-design.md`), a GitHub
issue, or a concrete spec. `<plans>` is `plans.folder` in `.claude/workflow.json`; while `plans.tracked` is `false`,
read and write it in the primary checkout (the first line of `git worktree list`).

## Persona

Domain expert for this product, senior product owner, Apple and Google grade UX, senior full-stack architect. Do not
agree by default: a flaw in the design is fixed in the plan, not carried forward. Existing code that is poor and
inside the plan's blast radius gets a targeted fix task.

## Step 1 — Load context

1. Read the input, `CLAUDE.md`, and the binding docs the change touches (the "Binding docs" table in `CLAUDE.md`).
2. Read `app-conventions` (the index) and the reference for each area a task touches. The reference is the rule; the
   plan cites it, it does not restate it. A vertical slice follows `feature-checklist.md` in order.

## Step 2 — Run `superpowers:writing-plans`

Follow its task breakdown, red-green-refactor per task and review checkpoints exactly. Every task also states:

- **Placement:** the backend domain (`apps/backend/src/domains/<domain>/`), the web feature or route
  (`apps/web/src/features/<feature>/`, `apps/web/src/app/…`), and why when it touches `packages/appshore/*`.
- **The references it follows**, by file name (`api-contract.md`, `events-and-outbox.md`, `frontend-lists.md`, …),
  and the guard that will hold it (the spec or gate rule the reference names).
- **Wire changes:** a new or changed route, DTO, serializer, status code or error. Those tasks end by regenerating
  OpenAPI (`pnpm --filter @app/backend openapi:generate`) and the plan's last gate includes `pnpm verify:api`.
- **Schema changes:** models in `app.prisma`, a forward migration that keeps existing rows, the enum mirror
  regenerated, `pnpm lint:schema`.
- **Tests:** the specs to add, mirroring the nearest neighbour and using `@appshore/platform/test/*` fixtures. A guard,
  rule or fix gets a spec that fails without it. 90% line and branch coverage on changed backend code is the review
  bar (`app-reviewer`, tests dimension); no threshold is configured.
- **Scaffolding:** a task touching `tools/init-app/`, a feature manifest, a skill or agent name, or a Desk-only line
  outside the Desk folder (one the Desk manifest must list) adds `pnpm verify:scaffold` to the gates.

## Step 3 — File the plan

Write `<plans>/plans/<YYYY-MM-DD>-<slug>-implementation.md` (keep the design's slug). Inside an epic, the slice plan is
`<plans>/plans/<epic>-<slice>-plan.md` (see `app-epic`).

## Step 4 — The plan's shape

On top of what `superpowers:writing-plans` produces, the plan carries these sections, in this order:

1. **Source** — the design, issue or spec it implements.
2. **Outcome** — one to three sentences: what changes in production, measurably.
3. **Touched surfaces** — domains, web features and routes, data (models, migrations, indexes), events, jobs,
   deadlines, cache, AI tools and prompts, outbound sends, plan features, foundation packages (with the reason).
4. **Tasks (ordered)** — goal, files, references followed, tests to add, review checkpoint.
5. **Tests** — the cases beyond the happy path; how the coverage bar is met.
6. **Rollout** — flag, migration order, backfill, observability (log events, metrics, alerts with their runbook).
7. **Docs (required)** — never empty. The binding docs and ADRs the change amends (`docs/domain-map.md` for a new
   entity, `docs/lifecycles-and-invariants.md` for a state or invariant, `docs/event-vocabulary.md` for an event,
   `docs/module-map.md` for a new folder or arrow, an ADR for a decision that is expensive to undo), the
   `app-conventions` reference that changes if a convention changes, the domain skill (`app-domain`) for a new
   persona, an invariant no guard holds or a deliberate difference from a foundation rule, and `README.md` or
   `CLAUDE.md` claims the change makes untrue. When nothing changes, write "none, because <reason>". **The last task of the plan runs
   `/app-dev-docs slice`.**
8. **Gates** — `pnpm verify` always; `pnpm verify:api` for a wire change; `pnpm verify:scaffold` for a scaffolding
   change; `cd apps/mobile && flutter analyze && flutter test` for mobile.
9. **Out of scope**, **Existing-code callouts**, **Open questions.**

## Step 5 — Hand off

End with the plan's path, the branch name (`feat/<slug>` off the default branch, `defaultBranch` in
`.claude/workflow.json`), and the next skill: `app-execute`. Do not start implementing.

## Stop and fix before finishing when

- There is no `## Docs` section, or its last task is not `/app-dev-docs slice`.
- A task names no placement, no reference, or no tests.
- A wire change has no OpenAPI regeneration, or the gates miss `pnpm verify:api`.
- A shared type is redefined locally instead of coming from `@app/shared-types`; an enum is hand-written instead of
  added to the Prisma schema.
- A task changes `packages/appshore/*` for an app-specific concern.
- You skipped `superpowers:writing-plans` or the references for the areas touched.
- You wrote code. That is `app-execute`.
