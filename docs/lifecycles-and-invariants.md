# Lifecycles and invariants

> **Binding doc** (see "Binding docs" in the root `CLAUDE.md`). It holds the rules that are always true and the
> state machine of every entity that has one. A rule here is either held by a spec, a database constraint or a guard
> (named beside it), or marked "review only". "Foundation (already here)" lists what the starter already holds;
> "Your product" is empty until the runway fills it. A change ships as an amendment in the same pull request.

## Foundation (already here)

### Invariants the starter holds

- A tenant never sees another tenant's record; it answers 404. Review only (ADR [Tenancy](adr/0009-tenancy.md)).
- One live account per email: the `users_email_live_key` index (ADR [Tenancy](adr/0009-tenancy.md)).
- Every request, job and event handler runs in a declared tenant context: the `rls-*` specs in
  `apps/backend/src/architecture/` (ADR [Tenancy](adr/0009-tenancy.md)).
- An event exists if and only if its write committed, and every consumer tolerates a second delivery:
  `no-direct-emit.spec.ts`, `double-delivery.spec.ts` (ADR [Outbox and deadlines](adr/0003-outbox-and-deadlines.md)).
- A timer is a `Deadline` row, never a delayed job (ADR [Outbox and deadlines](adr/0003-outbox-and-deadlines.md)).
- An Int primary key never crosses the API: `id-boundary.spec.ts` (ADR [ID boundary](adr/0002-id-boundary.md)).
- Every route succeeds and fails in the one contract: `api-contract.spec.ts`, `error-envelope.spec.ts` (ADR
  [API contract](adr/0001-api-contract.md)).
- Every outbound send goes through the outbound gate (`outbound-gate-coverage.spec.ts`); outside production only
  allow-listed recipients are messaged, and a held-back send is recorded (ADR
  [Outbound gate](adr/0006-outbound-gate.md)).
- Status values come from Prisma enums, never hand-copied: `enum-codegen-parity.spec.ts` (ADR
  [Enums come from Prisma](adr/0010-enums-from-prisma-open-vocabularies.md)).

### Foundation state machines

The foundation's status enums are in `packages/appshore/db/prisma/schema/foundation.prisma`: `TenantStatus`,
`InvitationStatus`, `SupportStatus`, `BillingSubscriptionStatus`, `BillingInvoiceStatus`, `IntegrationStatus`,
`NotificationStatus`, `DeliveryStatus`, `JobStatus`, `TenantAddOnStatus`, `FeedbackStatus`, `AnnouncementStatus`,
`AiInvocationStatus`, `AiCredentialStatus`. Their transitions live in the services that own them; a product that
builds on one documents the transitions it relies on in "Your product" below.

## Your product

### Global invariants

_How to fill this: numbered, always-true rules ("a signed record is never edited", "an order total equals the sum of
its lines"). For each: the rule in one sentence, then what holds it (a spec, a database constraint, a guard) or
"review only" with the reason. Numbered, so code comments and reviews can cite them._

### Lifecycle state machines

_How to fill this: one subsection per entity with a status. Name the Prisma enum, list the states, then each allowed
transition with who or what triggers it and the event it emits (names from `docs/event-vocabulary.md`). Say which
states are terminal and what may never happen (a transition that is not listed is forbidden)._

### Deletion and retention

_How to fill this: for each entity, whether it is hard-deleted, soft-deleted (`deletedAt`) or never deleted, and how
long its data is kept._
