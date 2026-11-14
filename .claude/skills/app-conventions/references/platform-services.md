---
owner: foundation
sources:
  - apps/backend/src/platform-glue/notifications/notification-types.ts#APP_NOTIFICATION_TYPES
  - apps/backend/src/platform-glue/notifications/app-notification-policies.ts#APP_NOTIFICATION_POLICIES
  - apps/backend/src/platform-glue/hooks.module.ts
  - apps/backend/src/domains/notifications/notification-triggers.service.ts#NotificationTriggersService
  - packages/appshore/platform/src/infrastructure/notifications/notification-policy.ts#policy
  - packages/appshore/platform/src/infrastructure/notifications/notification-policy.registry.ts
  - packages/appshore/platform/src/infrastructure/notifications/platform-notification-policies.ts
  - packages/appshore/platform/src/infrastructure/notifications/pipeline/notification-dispatcher.service.ts#NotificationDispatcherService
  - packages/appshore/platform/src/infrastructure/notifications/pipeline/channel-resolution.service.ts#ChannelResolutionService
  - packages/appshore/platform/src/infrastructure/storage/file-storage.service.ts#FileStorageService
  - packages/appshore/platform/src/health/health.controller.ts#HealthController
  - apps/backend/src/domains/billing/adapters/payment-provider.interface.ts
  - apps/backend/src/domains/billing/controllers/webhook.controller.ts#WebhookController
guards:
  - notification-policy-parity.spec.ts
  - notification-policy.registry.spec.ts
  - outbound-gate-coverage.spec.ts
  - outbound-channel-parity.spec.ts
  - whatsapp-template.registry.spec.ts
  - plan-gated-routes.spec.ts
---

# Platform services: notifications, file storage and streaming, health checks, billing

What the foundation already runs, where a product extends it, and what it must not bypass. Plan gating is in
[`plans-and-entitlements.md`](plans-and-entitlements.md); every outbound send also passes the outbound gate (ADR
`docs/adr/0006-outbound-gate.md`).

## What exists

Notifications. The pipeline lives in `packages/appshore/platform/src/infrastructure/notifications/`: a trigger names the type, the
title and the recipients; `NotificationDispatcherService.dispatch` resolves the tenant and its gates once, resolves
each recipient's channels (`ChannelResolutionService`: the type's policy, then the person's stored preference, quiet
hours for push, SMS and WhatsApp), delivers in-app first, then email, push, SMS and WhatsApp, and writes one ledger
row per channel, a skipped one with its reason. The email service is in
`packages/appshore/platform/src/infrastructure/notification/services/`.

## Rules

### Notifications

- A notification type is a string, not a Prisma enum. The product's types are `APP_NOTIFICATION_TYPES` in
  `apps/backend/src/platform-glue/notifications/notification-types.ts`; never add one to
  `PLATFORM_NOTIFICATION_TYPES`. [guard: notification-policy-parity.spec.ts]
- Every type has a policy in `APP_NOTIFICATION_POLICIES` (`app-notification-policies.ts`), built with `policy(category,
urgency, channelRules)`. The map is typed over the type list, so a type without a policy does not compile, and
  `NotificationPolicyRegistry` refuses to boot on a missing, undeclared or repeated type.
  [guard: notification-policy-parity.spec.ts, notification-policy.registry.spec.ts]
- A WhatsApp send needs a Meta-approved template in `APP_WHATSAPP_TEMPLATES`, keyed by type; with none, the type never
  sends on WhatsApp. [guard: whatsapp-template.registry.spec.ts]
- Code sends a notification only through a named method on `NotificationTriggersService`
  (`apps/backend/src/domains/notifications/notification-triggers.service.ts`), which resolves recipients by role or by
  user (scoped to the workspace's members) and calls the dispatcher. Never write a `notifications` row or call a
  channel directly. [guard: outbound-gate-coverage.spec.ts]
- Every channel send passes the outbound gate. [guard: outbound-gate-coverage.spec.ts, outbound-channel-parity.spec.ts]
- A trigger is started without blocking the main flow, with a `.catch` that logs. [guard: gate:empty-catch]
- A gate the dispatcher reads (the WhatsApp entitlement, the kill switch) fails closed: a lookup error means no send.
  [review-only: needs reading]
- An event addressed to a person is a notification. A standing truth for a whole workspace (a trial ending, setup
  incomplete, a platform message) is an announcement (`packages/appshore/platform/src/domains/announcements/`), not a
  one-off banner. [review-only: a modelling choice]

### File storage and generated documents

- Files go through `FileStorageService` (`packages/appshore/platform/src/infrastructure/storage/`): keys from
  `generateS3Key` (tenant first, then entity, then a UUID and the sanitized name), presigned URLs for upload and
  download, `uploadBuffer` and `downloadBuffer` on the server. Never build an S3 client elsewhere.
  [review-only: no spec scans for S3 clients]
- `S3_ENDPOINT` points the client at an S3-compatible store (the local MinIO in `docker-compose.yml`); unset means AWS.
  [guard: configuration.spec.ts]
- A route that returns a generated binary (a PDF, a CSV) streams it with `@Res({ passthrough: false })` and sets
  `Content-Type`, `Content-Length` and `Content-Disposition`; it never wraps a base64 blob in JSON. A user-supplied file
  name is sanitized first. A multi-megabyte export streams chunks instead of building one buffer.
  [review-only: no spec reads binary routes]
- Such a route still carries `@Roles`, and answers a failure with `writeErrorEnvelope`, since it never reaches the
  exception filter. [guard: error-envelope.spec.ts]

### Health checks

- `GET /health/live` answers while the process is up; `GET /health/ready` pings Postgres and Redis and answers 503 when
  either is down (`packages/appshore/platform/src/health/health.controller.ts`). Both are `@Public()` and
  `@SkipThrottle()`. A new dependency the task cannot serve without gets an indicator in `health/indicators/`.
  [review-only: the load balancer is the consumer]

### Billing

- Billing lives in `apps/backend/src/domains/billing/`: subscriptions, invoices, payment methods, the wallet and
  dunning, behind the payment-provider interface in `adapters/payment-provider.interface.ts` (Stripe is the one
  adapter). Domain code calls the billing services, never the provider SDK. [review-only: needs reading]
- A provider webhook is `@Public()`, verifies its signature over the raw body, answers 200 so the provider does not
  retry a handled event, and carries `@Throttle(GENEROUS_THROTTLE)` (see `controllers/webhook.controller.ts`).
  [guard: api-contract.spec.ts]
- What a plan allows is not billing's question: routes and jobs ask the entitlements service
  ([`plans-and-entitlements.md`](plans-and-entitlements.md)). [guard: plan-gated-routes.spec.ts]

## Recipe: add a notification

1. Add the type to `APP_NOTIFICATION_TYPES` (`SCREAMING_SNAKE`, at most 60 characters).
2. Add its policy to `APP_NOTIFICATION_POLICIES`, with the shape of the platform's own in
   `packages/appshore/platform/src/infrastructure/notifications/platform-notification-policies.ts`:
   `policy(NotificationCategory.SYSTEM, NOTIFICATION_URGENCIES.TIMELY, { email: CHANNEL_RULES.DEFAULT })`.
3. Add a named method to `NotificationTriggersService` that calls
   `trigger({ tenantId, type, title, message, recipientRoles })`, following the four already there.
4. Call it after the write commits, as `this.notificationTriggers.x(...).catch((err) => this.logger.warn(...))`.
5. Run the notification specs (`pnpm --filter @app/backend exec jest notification`).

## Flag in review

- A notification type added to the platform list, or a type with no policy.
- A channel service called directly, skipping the dispatcher or the outbound gate.
- A trigger awaited on the hot path, or one whose failure is swallowed.
- An S3 client built outside `FileStorageService`; a binary returned as base64 JSON.
- A provider SDK called outside the billing adapters.
