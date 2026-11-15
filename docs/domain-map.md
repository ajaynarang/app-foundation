---
sources:
  - packages/appshore/db/prisma/schema/foundation.prisma
  - packages/appshore/db/prisma/schema/app.prisma
verified: 2d3e125
---

# Domain map

> **Binding doc** (see "Binding docs" in the root `CLAUDE.md`). It names every entity, what it means, and how it
> relates to the others. The schema is the truth for columns; this doc is the truth for meaning. "Foundation (already
> here)" describes what the starter ships; do not remodel it. "Your product" is empty until the product's runway
> fills it. A change to the model ships as an amendment to this doc in the same pull request.

## Foundation (already here)

Every table below is in `packages/appshore/db/prisma/schema/foundation.prisma`. `app.prisma` beside it is empty: it
is where the product's models go. An Int primary key never leaves the API; a row the API exposes is addressed by its
public id (ADR [ID boundary](adr/0002-id-boundary.md); `docs/standards/` holds the conventions).

### The spine: tenants, users, sessions

- **`Tenant`**: a workspace, the unit of tenancy and billing. Never hard-deleted; suspended instead.
- **`User`**: a person. One live account per email (ADR [Tenancy](adr/0009-tenancy.md)).
- **`WorkspaceMember`**: user ↔ tenant, with the user's role in that workspace. The source of truth for membership.
- **`UserInvitation`**: a pending invitation into a workspace.
- **`RefreshToken`**: one session's rotating refresh token; carries the session's active workspace (`tenantId`).
- **`PasswordResetToken`**, **`LoginEvent`**: reset links (hashed) and the login history.
- **`UserPreferences`**, **`SuperAdminPreferences`**: per-user settings.

### Machine access

- **`ApiKey`**: a user's API key, stored as a hash, with scopes, IP allow-list and rate limit.
- **`OAuthClient`**, **`OAuthAuthorizationCode`**, **`OAuthAccessToken`**, **`OAuthRefreshToken`**: the OAuth 2.1
  provider, for external apps and agents acting for a person.

### Plans, billing, flags

- **`PlanConfig`**, **`PlanEntitlement`**, **`TenantPlanEvent`**: what each plan includes and a tenant's plan history.
- **`AddOn`**, **`TenantAddOn`**: purchasable extras and which tenant has them.
- **`BillingCustomer`**, **`BillingSubscription`**, **`BillingInvoice`**, **`PaymentMethod`**,
  **`ProcessedBillingEvent`**: the billing provider's mirror; `ProcessedBillingEvent` records each provider event
  once, so a redelivered webhook is skipped.
- **`Wallet`**, **`WalletTransaction`**: a tenant's balance and its ledger.
- **`FeatureFlag`**: a platform-wide flag, by key.

### Notifications and outbound

- **`Notification`**: an in-app notification for a user. **`NotificationDelivery`**: one row per channel attempt.
- **`NotificationDevice`**, **`PushSubscription`**, **`WhatsAppConsent`**: where and whether a user can be reached.
- **`OutboundAllowEntry`**, **`OutboundSuppression`**: the outbound gate's allow-list and suppressions (ADR
  [Outbound gate](adr/0006-outbound-gate.md)).
- **`Announcement`**: a broadcast to tenants.

### Events, jobs, timers, webhooks

- **`OutboxEvent`**: an event committed with its write; **`DomainEventLog`**: the event history (ADR
  [Outbox and deadlines](adr/0003-outbox-and-deadlines.md)).
- **`Deadline`**: a timer, as a row. **`DeadLetterLog`**: a queue job that exhausted its retries, kept for replay.
- **`Job`**, **`JobSchedule`**, **`TenantJobRun`**: tenant-visible jobs, schedules, and the per-tenant stamp that makes
  a time-of-day job run once per local day.
- **`TenantCounter`**: per-tenant sequences (human reference numbers).
- **`WebhookSubscription`**, **`WebhookDeliveryLog`**: outbound webhooks and their attempts (ADR
  [Outbound webhooks](adr/0013-outbound-webhooks.md)).

### Integrations

- **`IntegrationConfig`**: a tenant's connection to a vendor, its credentials encrypted (ADR
  [Credentials at rest](adr/0012-credentials-at-rest.md)). **`VendorConfig`**: operator overrides per vendor
  (enabled, OAuth on or off, order); the vendor's static metadata is `VENDOR_REGISTRY` in code.
- **`IntegrationExternalEntity`**, **`IntegrationEntityMapping`**: records pulled from a vendor, and how they map to
  local records.

### AI

- **`Conversation`**, **`ConversationMessage`**, **`ConversationSession`**: chat threads, their messages, and the
  opaque session token of an anonymous conversation.
- **`KnowledgeDocument`**: a knowledge-base chunk with its embedding and full-text vector.
- **`AgentInvocationLog`**, **`HitlChallenge`**: the audit of tool calls, and the human confirmation a write waits on.
- **`AiInvocation`**, **`ModelPricing`**, **`TenantAiBudget`**: one row per model call with its cost, the price table,
  and each tenant's budget.
- **`AiCredential`**, **`TenantAiSubKey`**: a workspace's own AI provider key (encrypted), and its capped sub-key
  (ADR [AI provider routing is per tenant](adr/0005-ai-provider-routing-per-tenant.md)).

### Support and feedback

- **`SupportTicket`**, **`SupportTicketMessage`**: tickets and their thread; `ticketNumber` is the public reference.
- **`Feedback`**: in-app feedback with its AI summary.

### Optional features

- **`DeskAgent`**, **`DeskResponsibility`**, **`DeskEpisode`**, **`DeskEpisodeStep`**, **`DeskApproval`**,
  **`DeskMemory`**, **`DeskEntitySuppression`**: the tables of the optional Desk feature. They stay in the schema,
  empty, in a product scaffolded without it (ADR
  [Optional features](adr/0004-optional-features-desk-opt-in.md)).

<!-- feature:desk:start -->

With Desk: a `DeskAgent` is an AI persona; a `DeskResponsibility` is its per-tenant job description; a `DeskEpisode`
is one run against one entity, made of `DeskEpisodeStep` rows; a `DeskApproval` is a person's decision on a gated
step; `DeskMemory` is what an agent learned; `DeskEntitySuppression` snoozes an entity. These tables hold config and
audit only; execution state lives in the workflow engine.

<!-- feature:desk:end -->

## Your product

_How to fill this: the runway fills it from `docs/VISION.md`'s core model. Group entities the way the product
talks about them. For each entity: one line on what it is, its parent, and its cardinality to the entities around it
(1:1, 1:N, N:M). Mark which ones are tenant-owned (all of them, normally)._

### The spine

_How to fill this: the two or three entities everything else hangs off, and how they relate._

### Entities, one line each

_How to fill this: one bullet per model you will add to `app.prisma`._

### Why these shapes

_How to fill this: the choices that would be expensive to undo (a separate table versus a column, a state machine
versus a flag), each with its reason or a link to its ADR._
