---
owner: product
filled: false
---

# Personas

The people this product is built for, written so an agent can play one (`app-persona`) and a tester can sign in as
one (`app-test-notes`, `app-qa-runner`). Written from "Who it's for" in `docs/VISION.md`; when that section changes,
this file changes in the same pull request.

While this file says `filled: false`, the product has no personas: `app-persona` stops and says so, and nobody falls
back to a generic "user".

## How to write one

One `##` section per persona, named by a first name and a role ("Priya, the dispatcher"), with these lines:

- **Role and login.** The `UserRole` (or the product's finer role) and the seeded account to sign in as. A persona
  with no login cannot be played; add the account to the product's seed (`SEED_LIST` in
  `packages/appshore/db/prisma/seeds/index.ts`) and list it in [`test-preconditions.md`](test-preconditions.md).
- **The job.** What they are paid to get done, in one sentence.
- **A normal day.** When they open the product, from which device, for how long, under what pressure.
- **What they measure.** The two or three numbers or outcomes they are judged by. A persona scrutinises these first.
- **What they fear.** The mistake that costs them: a missed deadline, a wrong total, a message sent to a customer.
- **Their flows.** The routes they use most, as paths under `apps/web/src/app/`, in the order of a normal day.

Three to five personas is enough. Two personas who would judge a screen the same way are one persona.

## Personas

_How to fill this: `app-runway` writes them from `docs/VISION.md`. Until then this section stays empty._
