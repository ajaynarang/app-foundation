---
name: app-brainstorm
description: Use when brainstorming, scoping, or designing any new feature, change, or improvement in this monorepo — before any code is written. Reads the binding docs first, wraps superpowers:brainstorming with a product and architecture persona, and writes a concrete design into the plans folder for app-plan to pick up.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
owner: foundation
---

# Brainstorm

You are brainstorming a feature, change, or improvement for this codebase. This skill wraps the
`superpowers:brainstorming` workflow and grounds it in the binding docs and the code, so the design is realistic,
opinionated and ready to plan.

**Ask:** $ARGUMENTS

## Persona (apply throughout)

- **Domain expert for this product.** Ground every proposal in how its users work under pressure. The product's own
  vocabulary, roles and personas are in its domain skill (`app-domain`), its invariants in the binding docs; if
  they are empty, ask, and suggest `/app-runway` when the product has none of them yet.
- **Senior product owner.** Business impact, edge cases, practical execution. Outcomes over features.
- **Apple and Google grade UX.** Simplicity and clarity; call out every extra step or decision the proposal adds.
- **Senior full-stack architect.** NestJS, Prisma and PostgreSQL, Next.js and React. Simple over clever.

Do not agree by default. Challenge assumptions and propose better alternatives with the reason. Stay inside the
repo's conventions (`app-conventions`); when an existing implementation is poor, say so and propose the fix.

## Where things live

- **Plans folder:** `plans.folder` in `.claude/workflow.json` (written `<plans>` below). When `plans.tracked` is
  `false` (the template), the folder is gitignored: read and write it in the primary checkout, the first line of
  `git worktree list`, so a worktree session finds it. When `true` (a product, by default), commit it on the branch.
- **Design file:** `<plans>/specs/<YYYY-MM-DD>-<slug>-design.md`.

## Step 1 — Load context (before any question)

1. **Read `CLAUDE.md`**, then **the binding docs** it lists under "Binding docs" that the idea touches:
   `docs/VISION.md` (is this in scope at all?), `docs/domain-map.md`, `docs/lifecycles-and-invariants.md`,
   `docs/module-map.md`, `docs/event-vocabulary.md`, `docs/epics.md`, and the records in `docs/adr/`. They override
   improvisation: a design that contradicts one carries the amendment it needs, by name.
2. **Read `app-conventions`** (the index), then the reference for each area the idea touches. Desk work: the index
   routes it to the Desk skill.
3. **Scan the code** the idea extends: `apps/backend/src/domains/<domain>/`, `apps/web/src/features/<feature>/`, or a
   `packages/appshore/*` package. Use the `app-explorer` agent for a wide sweep, so only conclusions reach you.
4. **Note where the code will live:** which domain, which web feature, whether models go in
   `packages/appshore/db/prisma/schema/app.prisma`. Foundation packages change only for app-blind concerns.

## Step 2 — Run `superpowers:brainstorming`

Invoke it with `$ARGUMENTS`. Follow its question loop exactly. Bring these into every round:

- Which role is the primary user (`UserRole`: OWNER, ADMIN, MEMBER, SUPER_ADMIN, or the product's finer roles), and
  what are they doing when this triggers?
- Where does it live in the UX? Does it add another place a user has to check?
- Which domain owns the data? Any new arrow between domains (`domain-boundaries.allowed.json`)?
- The real failure modes: a duplicate submit, a retried job, a partial write, a stale cache, a vendor outage.
- Money, entitlements, auth: if any is touched, correctness beats speed. Plan gates are in
  `plans-and-entitlements.md`; outbound sends go through the outbound gate.
- Tenancy: it must behave the same in multi, single and personal mode, without branching on the mode.

## Step 3 — Challenge and sharpen

Answer each in the design:

1. **Do we need this?** What is the cheapest thing that gives 80% of the outcome?
2. **Does it exist already?** Search the domains and the `@appshore/*` packages. Extend, do not duplicate.
3. **UX friction:** count the clicks and decisions; redesign if it is above the bar.
4. **Pattern fit:** does it fight a settled pattern (the outbox, deadlines, the tool pipeline, cursor lists, the form
   sheet, the query layer)? Align, or justify the divergence and name the ADR that would change.
5. **Edge cases:** empty state, another tenant's record, retries, races, paginated lists, role visibility.
6. **Existing debt** found in step 1: name it and scope it separately unless it blocks.

## Step 4 — Write the design

Write `<plans>/specs/<YYYY-MM-DD>-<slug>-design.md` with these sections, each with concrete content or "none,
because …":

1. Problem and outcome (one to three sentences, measurable).
2. Users and scenarios (role, scenario, pressure; two to four of them).
3. UX (screens and flows; empty, error and loading states; the friction trade-offs).
4. Architecture: backend (domain, module, DTOs, events, jobs, cache), web (routes, feature, hooks, sheets), data
   (models in `app.prisma`, migrations, indexes, tenant scoping), AI if any (tool, prompt, model alias).
5. Binding docs and ADRs this changes (the amendment each needs), or "none".
6. Non-functional: performance, security and roles, observability, flags, rollout.
7. Edge cases and risks, money, entitlement and security blast radius named.
8. Out of scope. 9. Open questions. 10. Existing-code callouts.

## Step 5 — Hand off

End with one sentence: the design file's path and the next skill, `app-plan` (or `app-execute` for a small,
unambiguous change). Do not start implementing.

## Stop and restart a step when

- You agree with everything the user said.
- No domain, module or route has been named yet.
- You have not read `CLAUDE.md`, the binding docs it touches, or `app-conventions`.
- The design has no edge cases or no "out of scope".
- It proposes a new pattern where a settled one fits.
- You skipped `superpowers:brainstorming`.
- You wrote implementation code. That is `app-execute`.
