---
owner: product
filled: false
---

# Test preconditions

What must be true before anyone tests this product by hand or drives it with an agent (`app-test-notes`,
`app-qa-runner`, `app-persona`). The foundation's own preconditions (the seeded logins, `TENANCY_MODE`, plans and
feature flags, background timing, the outbound gate, AI without a key, which commit is running) are in
`app-test-notes`; this file adds only what the product brings.

While this file says `filled: false`, the product has added nothing: use the foundation's list alone, and say so in
the notes.

## Logins

_How to fill this: one row per persona in [`personas.md`](personas.md): the account, its role, its workspace. Seeded
accounts only; a login a tester must create by hand is a missing seed (`SEED_LIST` in
`packages/appshore/db/prisma/seeds/index.ts`)._

| Persona | Account | Role | Workspace |
| ------- | ------- | ---- | --------- |

## Demo data

_How to fill this: what the seed creates for the product's domain (how many of each entity, in which states), the
command that creates it, and how to reset it. Name a state a flow needs that the seed does not create, and how to
reach it._

## Settings and flags

_How to fill this: the product's own feature keys (`FEATURE_KEYS`), plan features and workspace settings that switch a
flow on or off, and the value each test assumes. A surface that is dark by default is named here first._

## Timing

_How to fill this: the product's own background work a tester waits for (a job, a deadline kind, an event consumer),
how long it takes locally, and what to refresh._

## Out of reach locally

_How to fill this: what cannot be tested on a laptop (a vendor sandbox, a real phone number, a webhook from outside)
and what the tester should see instead._
