---
name: app-domain
description: Use when working on this product's own domain — its entities, roles, personas, invariants, and anywhere it deliberately differs from the foundation conventions. Read it after app-conventions for any product feature; the review, QA, persona and test-notes workflow reads its references. Ships empty in the starter; app-runway fills it.
owner: product
filled: false
---

# This product's domain

The product's own knowledge, on top of the foundation rules in `app-conventions`. The foundation skills never name a
product entity; everything this product adds about itself goes here, in its references, or in further references
under this folder. How it fits together is `docs/adding-your-domain.md`.

**Filled or not.** `filled: false` in this file's frontmatter, or in a reference's, means nobody has written it yet:
a reader treats it as absent and says so, and never invents its content. `app-runway` fills it in the product's first
days and sets `filled: true`; after that the pull request that changes the domain keeps it true. Delete each "How to
fill this" line once its section is written.

The binding docs (`docs/VISION.md`, `docs/domain-map.md`, `docs/lifecycles-and-invariants.md`,
`docs/event-vocabulary.md`, `docs/module-map.md`, `docs/epics.md`, `docs/adr/`) are the architecture of record. This
skill points at them and never copies them: a fact written twice drifts.

## Vocabulary

_How to fill this: the words the product's users use, one row each, with what the code calls the same thing and the
word not to confuse it with. Entities themselves, their parents and cardinality are in `docs/domain-map.md`; link it,
do not repeat it._

| Term | Means | In the code | Not to be confused with |
| ---- | ----- | ----------- | ----------------------- |

## Roles and personas

_How to fill this: how the foundation roles (`UserRole` in `packages/appshore/db/prisma/schema/foundation.prisma`:
OWNER, ADMIN, MEMBER, SUPER_ADMIN) map onto the people this product serves, and any finer role the product adds.
One line per role: who holds it and what it may do that the role below may not. The people themselves, with their
day and their logins, are in [`personas.md`](references/personas.md)._

## Invariants

_How to fill this: nothing here but a pointer. The always-true rules and every state machine are in
`docs/lifecycles-and-invariants.md`, each with the guard that holds it. Name the two or three a newcomer breaks first
and link their sections there._

## Where this product differs

_How to fill this: one row per foundation rule this product deliberately does not follow. Each row names the rule
(its reference under `.claude/skills/app-conventions/references/`), what this product does instead, and the ADR under
`docs/adr/` that records why. No row without an ADR. A difference that is not listed here is drift, and review flags
it. Empty is the normal state._

| Foundation rule | This product instead | ADR |
| --------------- | -------------------- | --- |

## Domain review checks

The checks the `domain` review dimension runs (`app-reviewer`): what a reviewer must look for in this product's own
code that no foundation rule and no guard covers. They are in [`review-checks.md`](references/review-checks.md).

## Test preconditions

What a tester needs before a hand test or a QA run of this product: logins per persona, demo data, the settings and
flags a flow depends on, and how long background work takes. In
[`test-preconditions.md`](references/test-preconditions.md). The foundation's own list is in `app-test-notes`.

## Domain hotspots

_How to fill this: the product's own drift hotspots go in `.claude/hooks/hotspots/product.json`, which the drift
reminder reads after every edit, never in `foundation.json`. Same shape: `{ "paths": [globs], "say": "what this
change makes untrue", "docs": [files to re-check] }`. Add one when changing a file always means changing another
(a pricing table and its doc, a state machine and its diagram). List each here in one line._

## Adding a reference

A further reference goes under this folder's `references/`, with the same frontmatter as the ones here (`owner:
product`; `sources:` for the code it describes, so the skills guard checks it and the drift reminder names it when
that code changes) and a link from this file. A rule in it ends with its guard or `[review-only: <reason>]`, as in
the foundation references.
