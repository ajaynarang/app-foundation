---
name: plan
description: Use when writing an implementation plan for this NestJS/Prisma + Next.js monorepo from a spec, design doc, or brainstorm output — before touching code. Wraps superpowers:writing-plans, applies the repo's pattern skills, and files plans under docs/plans/.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
---

# Plan

You are authoring an implementation plan for this codebase. This skill wraps `superpowers:writing-plans` and layers the repo's conventions on top so the executor can work without re-deriving decisions.

**Input:** $ARGUMENTS — typically a path to a design/brainstorm doc (often `docs/plans/...-design.md`) or a concrete spec.

---

## Persona (apply throughout)

- **Domain expert for THIS product** — ground every step in how the app's users actually operate.
- **Senior Product Owner** — business impact, edge cases, practical execution.
- **Apple/Google UX bar** — flag friction in planned flows; simpler is better.
- **Senior full-stack architect** — Next.js 15 / React, NestJS 11, PostgreSQL 16 + Prisma. Prefer simple over clever. Apply DRY and KISS.

**Non-negotiables:**

- Do **NOT** agree by default. If the input design has a flaw, fix it in the plan — don't carry it forward. Call out existing code that is suboptimal and, if it's inside this plan's blast radius, include a targeted fix step.
- Stay consistent with `backend-patterns`, `frontend-patterns`, and CLAUDE.md.

---

## Workflow

### Step 1 — Load context

1. Read the input (design, brainstorm, or spec) from `$ARGUMENTS`.
2. Read CLAUDE.md for the monorepo structure and conventions.
3. Invoke the relevant pattern skills before drafting:
   - Backend touch → `backend-patterns`
   - Frontend touch → `frontend-patterns`
   - Mobile touch → `mobile-patterns`
   - Desk touch → `desk-patterns`

### Step 2 — Invoke `superpowers:writing-plans`

Invoke `superpowers:writing-plans` with the spec/design as input. Follow its task-decomposition, RED/GREEN/REFACTOR-per-task, and review-checkpoint structure exactly. Layer these repo-specific rules into every task:

- **Placement** — state the backend domain (`apps/backend/src/domains/<domain>/`) and the frontend feature/route (`apps/web/src/features/<feature>/`, `apps/web/src/app/...`) for every task. Foundation packages (`packages/appshore/*`) change only for app-blind, cross-cutting concerns — call it out explicitly if a task touches them.
- **Types of record** — all shared types/Zod schemas come from `@app/shared-types`. No local duplicates. Enums come from the Prisma schema (backend imports from `@appshore/db`; frontend from the generated mirror).
- **Events** — any emit goes through `DomainEventService` with an `APP_EVENT_REGISTRY` entry. No plain-object events, no raw `EventEmitter2`.
- **AI calls** — conversational AI through the Mastra agent runtime; structured extraction through `StructuredOutputService`; Desk steps through `runStructuredLlmStep()`. No ad-hoc SDK calls.
- **Dates** — Calendar Date (`@db.Date`) vs Timestamp (`@db.Timestamptz`) chosen deliberately. Never `new Date(dateOnlyString)`.
- **Migrations** — via the `@appshore/db` package scripts (`pnpm prisma:migrate`, `pnpm prisma:generate`); app models go in `app.prisma`.
- **Frontend** — Sheet for 4+ field forms, Dialog for 1–4 fields or quick actions, AlertDialog for destructive; Skeleton (not spinner) for `isLoading`; every mutation has `showSuccess` + `showError`; dark-theme-safe tokens; responsive at 375/768/1440.
- **Security/RBAC** — every new endpoint has `@Roles`; every Prisma query is tenant-scoped; roles explicitly listed.
- **Tests** — each task lists the unit tests to add (≥ 90% coverage target on changed backend files), mirroring the nearest existing `*.spec.ts` pattern and using fixtures from `@appshore/platform/test/*`.

### Step 3 — File the plan

Write to `docs/plans/YYYY-MM-DD-<slug>-implementation.md` (or `-plan.md` for a phased rollout plan; create `docs/plans/` if missing). If the input design already lives in `docs/plans/`, keep the same slug family.

### Step 4 — Plan document structure

Use this structure on top of what `superpowers:writing-plans` produces:

```markdown
# <Feature title> — Implementation Plan

## Source

<Link to the design/brainstorm doc this plan implements.>

## Outcome

<1–3 sentences. What changes in production when this ships. Measurable.>

## Touched surfaces

- Backend domain(s): <domains/...>
- Frontend feature(s)/route(s): <features/..., app/...>
- Data: <Prisma models in app.prisma, migrations, indexes>
- Events / queues / cache: <list>
- Integrations / AI: <list>
- Foundation packages touched (if any): <packages/appshore/... + justification>

## Tasks (ordered)

<Each task from superpowers:writing-plans, with the repo rules layered in.
For each task: goal, files, tests to add, review checkpoint.>

## Tests & coverage

<How we'll hit ≥ 90% on changed backend files. Key cases beyond happy path.>

## Rollout

<Feature flag? Migration order? Backfill? Observability hooks?>

## Out of scope

<Explicit non-goals.>

## Existing-code callouts

<Flagged suboptimal code within blast radius, with proposed fix scope.>

## Open questions

<Anything that still needs a human answer.>
```

### Step 5 — Hand off

End with: the plan's absolute path, the target branch name (e.g. `feat/<slug>` off the default branch), and the next skill: `execute`. Do not start implementation here.

---

## Red flags — STOP and fix before finalizing

- A task doesn't name a domain/feature placement or a test list.
- Shared types are redefined locally instead of importing from `@app/shared-types`.
- A new enum is hand-written instead of added to the Prisma schema.
- Event emission isn't going through `DomainEventService` + the event registry.
- An AI call bypasses the sanctioned paths without justification.
- A task silently modifies `packages/appshore/*` for an app-specific concern.
- You skipped `superpowers:writing-plans`, `backend-patterns`, or `frontend-patterns`.

---

## What NOT to do

- Do NOT write code — that's `execute`.
- Do NOT skip `superpowers:writing-plans`. This skill wraps it, does not replace it.
- Do NOT leave any task without an explicit test list and review checkpoint.
