# Architecture Decision Records

Short, dated records of decisions that are expensive to change later. One decision per file: a paragraph on the
context, the decision, and what follows from it.

## How a record gets its number

- Files are named `NNNN-short-title.md`, four digits, starting at `0001`.
- A new record takes the next free number in this folder at the time its pull request is written. Numbers are never
  reused and never reserved ahead of time.
- Other documents refer to a record by its **title**, not its number, so two branches that each add a record can
  renumber on merge without breaking a link in prose.
- A decision that changes is amended in place, under a dated "Amendment" heading. A decision that is replaced gets a
  new record, and the old one is marked "Superseded by" with a link.

Your product's own decisions go in this folder too, with the same numbering.

## Records

| #                                             | Decision                                                                                                     | Status  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| [0001](0001-api-contract.md)                  | API contract: one contract for people and agents (status, errors, inputs, lists, versioning)                 | Adopted |
| [0002](0002-id-boundary.md)                   | ID boundary: an Int primary key never crosses the API; the public id is a sixth id role                      | Adopted |
| [0003](0003-outbox-and-deadlines.md)          | Outbox and deadlines: every domain event commits with its write; delivery is at least once; a timer is a row | Adopted |
| [0004](0004-optional-features-desk-opt-in.md) | Optional features: Desk is opt-in at scaffold time; the seam and the manifest remove it; its tables stay     | Adopted |
