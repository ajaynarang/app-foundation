---
owner: product
filled: false
---

# Domain review checks

What the `domain` dimension of `app-reviewer` looks for in this product's own code: the mistakes that are wrong
because of what the product is, which no foundation rule and no guard can know. The foundation dimensions
(correctness, authz-tenancy, contract, conventions, tests, performance, ui, mobile) already run on every diff; do
not repeat their checks here.

While this file says `filled: false`, the reviewer returns an empty list for the dimension and says the product has
not written its checks yet.

## How to write one

One numbered item per check:

- **The check**, in one sentence a reviewer can apply to a diff ("every change to a quote's total re-reads the
  price list inside the same transaction").
- **Where it applies**: the paths it covers (`apps/backend/src/domains/<domain>/`, a web feature, a job).
- **The failure** it prevents: the inputs or state, then the wrong result a user would see.
- **The invariant** it protects, linked to its section in `docs/lifecycles-and-invariants.md`, when there is one.

A check a machine could hold belongs in a spec, not here: write it under `apps/backend/src/architecture/` (or beside
the code), and delete the item once the spec is green. A reviewer is never spent on a rule a guard holds. Keep the
list short; ten checks a reviewer actually runs beat thirty it skims.

## Checks

_How to fill this: `app-runway` seeds the first ones from the invariants that have no guard yet. Until then this
section stays empty._
