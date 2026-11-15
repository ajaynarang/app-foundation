---
name: app-runway
description: Use in a product's first days, right after init-app, before any domain code — or when asked to "start the runway", "fill the binding docs", "write the vision and domain map", or /app-runway. Interviews the owner one doc at a time and writes the binding docs in order (vision, domain map, lifecycles and invariants, first ADRs, event vocabulary, module map, epics), then fills the domain skill and the CLAUDE.md binding table. Resumes at the first doc that is not filled yet.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
owner: foundation
---

# Runway

Decide the expensive-to-change things once, up front, at low fidelity; build everything else in thin, demoable
slices. The runway is the "once, up front" part: a few days, not weeks. It ends when every binding doc has its "Your
product" part written, the domain skill is filled, and epic E1 is ready for `app-epic`.

**Ask:** $ARGUMENTS (a product idea, a doc to resume at, or nothing).

## Before you start

- **Not in the starter itself.** Read `TEMPLATE_NAME` in `tools/init-app/init-app.mjs` (init-app never rewrites its
  own folder, so it keeps the template's name). If the root `package.json` name equals it, this is the template, not
  a product: stop and say the runway runs in a product made with `pnpm init-app`.
- **Resume, do not restart.** Check each step in the order below, and start at the first one that is not done; say
  which. A doc is done when the part the product writes has no "How to fill this" line left. That part is "Your
  product" where the doc has one; `docs/VISION.md` and `docs/epics.md` have no foundation part, so the whole doc is
  the product's. Step 4 is done when `docs/adr/` holds a record numbered above the last one the starter shipped (`git log
--diff-filter=A -- docs/adr/` shows which came with the scaffold; in doubt, ask the owner). Step 8 is done when every file under `.claude/skills/app-domain/` says `filled: true`. Step 9 is done when the "Binding
  docs" section of `CLAUDE.md` no longer says the docs are skeletons.
- **Read first:** `CLAUDE.md` (the "Binding docs" table and the amendment rule), `docs/how-we-build.md`, and the
  "Foundation (already here)" part of each doc. The foundation already decides tenants, users, sessions, plans,
  billing, notifications, events, jobs, timers and AI; the product builds on those and never redefines one.
- **Branch.** Work on a branch (`runway`, or the one the owner names); never on the default branch.

## How the interview runs

Run `superpowers:brainstorming` for its question discipline: one question at a time, multiple choice where it helps,
two or three approaches with your recommendation when there is a real choice. The output is not its design file:
it is the binding doc of the step you are on, so do not let it write a spec or hand off to a plan.

- **One doc at a time.** Draft the doc's "Your product" part, show it, and get the owner's yes before the next step.
  Changing a doc now is free; changing merged code is not.
- **Never invent a fact.** What the owner does not know yet goes under "Open questions" in `docs/VISION.md`, with the
  date. A guess written as a decision is the most expensive line in the runway.
- **Leave the foundation parts alone.** Write only under "Your product" (in `docs/VISION.md` and `docs/epics.md`,
  anywhere: the whole doc is the product's). Delete each "How to fill this" line once its section is written. Leave `sources:` and `verified:` lines as they are; `app-dev-docs audit` owns them.
- **Low fidelity.** Names, shapes and rules, not columns or screens. The schema holds the columns, later.
- **Commit each doc** once the owner approves it, one commit per doc, with a message that says why.

## The steps

### Step 0 — the walking skeleton

Confirm the product runs before writing about it: `init-app` has run, `TENANCY_MODE` is chosen (multi, single or
personal), and `pnpm verify` passes on the default branch. If it does not, fix that first; the runway assumes a green
starter. The empty product may already be deployed to staging (`docs/operations.md`); that is the owner's call.

### Step 1 — `docs/VISION.md`

Ask, in order: the vision in two sentences; the problem in the customer's words and today's workaround; the first
customer and the first user as concrete people, and who it is not for; the three to six ideas the product is built
on; the principles that settle a design argument; what it will not do; what success looks like in three months and
a year. Push back on a vision that cannot say no to a feature.

### Step 2 — `docs/domain-map.md`

From the core model in the vision: the spine (the two or three entities everything hangs off), then one line per
entity (what it is, its parent, its cardinality, tenant-owned or not), then the shapes that would be expensive to
undo, each with its reason. Map each idea onto what the foundation already has before adding an entity: a user, a
workspace, a plan, a notification type, a job.

### Step 3 — `docs/lifecycles-and-invariants.md`

The always-true rules, numbered, each with what will hold it (a spec, a database constraint, a guard) or "review
only" and why. Then one state machine per entity with a status: the Prisma enum it will be, the states, each allowed
transition with its trigger and the event it emits. Then deletion and retention per entity.

### Step 4 — the first ADRs in `docs/adr/`

One record per decision the first three docs made that is expensive to undo: the spine, a choice of tenancy mode, a
money or unit model, an external system the product depends on, anything that shapes the schema or the wire. Start
each from `docs/adr/0000-template.md`, take the next free number, and add its row to the index in
`docs/adr/README.md`. A decision one pull request can reverse needs no record.

### Step 5 — `docs/event-vocabulary.md`

One table per aggregate: the event name (`app.<aggregate>.<past-tense-action>`, named for what happened), who emits
it, who listens, and whether it leaves the process. Every transition in step 3 that others care about is an event
here. The registry entries (`APP_EVENT_REGISTRY` in `apps/backend/src/platform-glue/events/event-registry.ts`) are
added with the code, in the epic that raises the event, not now.

### Step 6 — `docs/module-map.md`

One row per backend domain (`apps/backend/src/domains/<domain>/`: the entities it owns, the events it emits, the jobs
it runs), one per web feature (`apps/web/src/features/<feature>/` and the domain it talks to), then the allowed
arrows between domains, kept a tree. Write the arrows in the doc only. Each arrow joins
`apps/backend/src/architecture/domain-boundaries.allowed.json` in the pull request that adds the import:
`domain-boundaries.spec.ts` fails on an import along an unlisted arrow and on a listed arrow nothing uses, so an arrow
written ahead of its code fails `pnpm verify`.

### Step 7 — `docs/epics.md`

Risk first: the epics most likely to prove the domain map wrong come first, while fixing it is cheap. E1 is the
spine and runs alone. Each epic in the doc's block shape: entities, events, modules, "demoable when" as click-through
steps, the risk it retires and the ADR it would amend, status. Two epics may run side by side only when their modules
differ.

### Step 8 — the domain skill, `.claude/skills/app-domain/SKILL.md`

Fill it from the docs above, pointing at them rather than copying: the vocabulary table, the roles mapped onto
`UserRole`, the two or three invariants a newcomer breaks first (links into step 3's doc), and "Where this product
differs" (normally empty; a row only with an ADR from step 4). Then its references:

- `.claude/skills/app-domain/references/personas.md`: three to five personas from "Who it's for" in the vision, each
  with a role, a login, a day, what they measure and fear, and their flows.
- `.claude/skills/app-domain/references/review-checks.md`: one check per invariant from step 3 that no guard will
  hold, in the file's shape.
- `.claude/skills/app-domain/references/test-preconditions.md`: the logins the personas need, the demo data, the
  settings and flags, the product's own timing. A login or demo record the seed does not create yet becomes a task in
  epic E1.

Add a hotspot to `.claude/hooks/hotspots/product.json` for any pair of files that must change together. Set
`filled: true` in each file you wrote, and only in those.

### Step 9 — the binding table in `CLAUDE.md`

In the "Binding docs" section, replace the sentence that says the docs are skeletons with one that says they are this
product's, filled on the runway's date. Add a row for the domain skill (`.claude/skills/app-domain/`: vocabulary,
personas, review checks, and where this product differs). Make the same change to the binding-docs part of
`docs/README.md`. Replace the starter's one-paragraph description at the top of `CLAUDE.md` with the vision statement
from step 1, and keep the foundation sections below it as they are.

### Step 10 — close the runway

Run `pnpm guards` (the docs guard catches a dead link or a path that does not exist) and `pnpm verify`, then open the
pull request from `.github/pull_request_template.md` with the verify line in its body. The owner reads the docs in
it and merges. Then say the next step in one line: `/app-epic E1`.

## Stop and restart a step when

- You wrote a decision the owner did not make, or filled a gap with a guess instead of an open question.
- You moved to the next doc without the owner's yes on this one.
- You changed a "Foundation (already here)" part, or redefined something the foundation already has.
- You wrote code, a migration, a registry entry or an allowed arrow. The runway writes docs; E1 writes code.
- An entity has no owner domain, a state has no way out, or an event is named for what a listener should do.
- The domain skill copies a doc instead of pointing at it.
