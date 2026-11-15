# Architecture Decision Records

Short, dated records of decisions that are expensive to change later. One decision per file: a paragraph on the
context, the decision, and what follows from it.

## What an ADR is for

- **Write one** when a choice is expensive to undo: it shapes the schema, the wire contract, the package layers, a
  security boundary, or what every product built from this starter inherits. A choice that one pull request can
  reverse does not need a record.
- **A record decides; it does not explain.** How something works lives in the code, in `CLAUDE.md` and in the docs
  under `docs/`. The record says what was chosen, why, and what holds it.
- **Every rule names its guard.** A rule a machine can check names the spec, lint rule or guard script that holds
  it. A rule nothing can check says "review only" and why.
- **The records are binding.** Product work follows them. Deviating is allowed only as a deliberate amendment in the
  same pull request as the code (see "How to amend" below). The other binding docs are listed in the root
  `CLAUDE.md`, under "Binding docs".

Start a new record from [`0000-template.md`](0000-template.md).

## How a record gets its number

- Files are named `NNNN-short-title.md`, four digits, starting at `0001`. `0000-template.md` is the template, not a
  record.
- A new record takes the next free number in this folder at the time its pull request is written. Numbers are never
  reused and never reserved ahead of time.
- Other documents refer to a record by its **title**, not its number, so two branches that each add a record can
  renumber on merge without breaking a link in prose. A Markdown doc also links the file
  (`[Outbox and deadlines](0003-outbox-and-deadlines.md)`), so a renumber that misses a link shows up as a broken
  link, not as a silent wrong reference.
- The index below is the only list of records. A new record adds its row in the same pull request.

Your product's own decisions go in this folder too, with the same numbering.

## How to amend

- **A decision that changes** is amended in place, under a dated heading at the end of the record:
  `### Amendment — YYYY-MM-DD: <what changed>`, then what changed, why, and what now holds it. The original text
  above stays as it was, so the history reads top to bottom.
- **A decision that is replaced** gets a new record. The old one's status becomes "Superseded by" with a link to
  the new one, and its row in the index says so.
- **An amendment ships with its code.** The pull request that changes the behaviour amends the record and any
  binding doc the change makes untrue. A reviewer treats code that contradicts a record, with no amendment, as a
  finding.

## Records

| #                                                              | Decision                                                                                                      | Status  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- |
| [0001](0001-api-contract.md)                                   | API contract: one contract for people and agents (status, errors, inputs, lists, versioning)                  | Adopted |
| [0002](0002-id-boundary.md)                                    | ID boundary: an Int primary key never crosses the API; the public id is a sixth id role                       | Adopted |
| [0003](0003-outbox-and-deadlines.md)                           | Outbox and deadlines: every domain event commits with its write; delivery is at least once; a timer is a row  | Adopted |
| [0004](0004-optional-features-desk-opt-in.md)                  | Optional features: Desk is opt-in at scaffold time; the seam and the manifest remove it; its tables stay      | Adopted |
| [0005](0005-ai-provider-routing-per-tenant.md)                 | AI provider routing is per tenant; retention is enforced in the resolver                                      | Adopted |
| [0006](0006-outbound-gate.md)                                  | Outbound gate: outside production only allow-listed recipients are messaged; every held-back send is recorded | Adopted |
| [0007](0007-ci-manual-enforcement-local.md)                    | CI is manual by default; enforcement is local (git hooks and `pnpm verify`, whose result line a PR carries)   | Adopted |
| [0008](0008-package-layering.md)                               | Package layering: kernel, db, platform, apps; dependency arrows point one way                                 | Adopted |
| [0009](0009-tenancy.md)                                        | Tenancy: three modes, workspace membership, one live account per email, manual scoping, a declared context    | Adopted |
| [0010](0010-enums-from-prisma-open-vocabularies.md)            | Enums come from Prisma and the mirror is generated; open vocabularies are strings with a registry             | Adopted |
| [0011](0011-one-postgres-plus-redis.md)                        | One Postgres (pgvector) plus Redis; no second store                                                           | Adopted |
| [0012](0012-credentials-at-rest.md)                            | Credentials at rest: keys hashed, secrets encrypted, production refuses to boot on a default or placeholder   | Adopted |
| [0013](0013-outbound-webhooks.md)                              | Outbound webhooks: SSRF guard at save and at delivery; Standard Webhooks signing with rotation                | Adopted |
| [0014](0014-one-web-app.md)                                    | One web app: the separate console is removed; admin and settings live in the web app                          | Adopted |
| [0015](0015-workflow-conventions-index-guards-domain-skill.md) | Workflow: a conventions index, guards before prose, the product's own domain skill                            | Adopted |
| [0016](0016-planning-artifacts-tracked-in-products.md)         | Planning artifacts: untracked in the template, tracked by default in a product                                | Adopted |
| [0017](0017-state-lives-in-postgres.md)                        | State lives in Postgres; the workflow engine only orchestrates                                                | Adopted |
| [0018](0018-observability-open-protocols.md)                   | Observability: open protocols; Grafana Cloud and Sentry pre-wired and off without keys; CloudWatch fallback   | Adopted |
