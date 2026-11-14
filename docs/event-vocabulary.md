---
sources:
  - packages/appshore/kernel/src/infrastructure/events/foundation-events.ts
  - apps/backend/src/platform-glue/events/event-registry.ts
verified: 2d3e125
---

# Event vocabulary

> **Binding doc** (see "Binding docs" in the root `CLAUDE.md`). Every domain event, by name. Use the names verbatim
> in code, tests and docs. The registry in code is the truth (ADR
> [Enums come from Prisma; open vocabularies are strings with a registry](adr/0010-enums-from-prisma-open-vocabularies.md));
> this doc adds what each event means and who listens. A new or renamed event ships as an amendment in the same pull
> request.

## How events work here

- Keys are `app.<aggregate>.<verb>` in kebab-case, the verb normally past tense (`app.user.invited`). Code names an
  event through its `DOMAIN_EVENTS` constant, derived from the registry.
- An event is raised inside its write's transaction with `OutboxService.transaction((tx, emit) => …)`, so it exists
  if and only if the write committed. Delivery is at least once: every consumer keys on the event id (ADR
  [Outbox and deadlines](adr/0003-outbox-and-deadlines.md)).
- `external` events can be subscribed to by outbound webhooks (ADR [Outbound webhooks](adr/0013-outbound-webhooks.md));
  `internal` events stay inside the app. Making an event external is a public wire change.

## Foundation (already here)

The foundation's own catalog, `FOUNDATION_EVENT_REGISTRY` in
`packages/appshore/kernel/src/infrastructure/events/foundation-events.ts`. Do not add product events there.

### Platform

| Event                             | Visibility | Meaning                     |
| --------------------------------- | ---------- | --------------------------- |
| `app.user.created`                | internal   | User created                |
| `app.user.invited`                | external   | User invited                |
| `app.user.joined`                 | external   | User joined                 |
| `app.user.deactivated`            | internal   | User deactivated            |
| `app.tenant.updated`              | external   | Tenant updated              |
| `app.feature-flag.toggled`        | internal   | Feature flag toggled        |
| `app.preferences.updated`         | internal   | User preferences updated    |
| `app.api-key.rotated`             | internal   | API key rotated             |
| `app.api-key.revoked`             | internal   | API key revoked             |
| `app.api-key.scopes-updated`      | internal   | API key scopes updated      |
| `app.api-key.paused`              | internal   | API key paused              |
| `app.api-key.resumed`             | internal   | API key resumed             |
| `app.oauth-client.rotated`        | internal   | OAuth client secret rotated |
| `app.oauth-client.revoked`        | internal   | OAuth client revoked        |
| `app.oauth-client.scopes-updated` | internal   | OAuth client scopes updated |
| `app.oauth-client.paused`         | internal   | OAuth client paused         |
| `app.oauth-client.resumed`        | internal   | OAuth client resumed        |

### Notifications

| Event                      | Visibility | Meaning              |
| -------------------------- | ---------- | -------------------- |
| `app.notification.created` | external   | Notification created |
| `app.notification.sent`    | internal   | Notification sent    |

### Integrations

| Event                    | Visibility | Meaning            |
| ------------------------ | ---------- | ------------------ |
| `app.integration.synced` | external   | Integration synced |
| `app.sync.started`       | internal   | Sync started       |
| `app.sync.completed`     | internal   | Sync completed     |
| `app.sync.failed`        | internal   | Sync failed        |

### AI

| Event                                | Visibility | Meaning                                |
| ------------------------------------ | ---------- | -------------------------------------- |
| `app.ai.message`                     | external   | AI message                             |
| `app.conversation.session-issued`    | internal   | Conversation session issued            |
| `app.conversation.session-revoked`   | internal   | Conversation session revoked           |
| `app.conversation.archived`          | internal   | Conversation archived                  |
| `app.ai.invocation-recorded`         | internal   | A model call was recorded              |
| `app.ai.budget-soft-breached`        | internal   | A tenant passed its soft AI budget cap |
| `app.ai.budget-hard-breached`        | internal   | A tenant hit its hard AI budget cap    |
| `app.ai.zero-retention-unavailable`  | internal   | No zero-retention route was available  |
| `app.ai.credential-connected`        | external   | A workspace AI key was connected       |
| `app.ai.credential-validated`        | external   | A workspace AI key passed its probe    |
| `app.ai.credential-failed`           | external   | A workspace AI key failed              |
| `app.ai.credential-removed`          | external   | A workspace AI key was removed         |
| `app.ai.retention-policy-changed`    | external   | Workspace retention policy changed     |
| `app.agent.invocation-completed`     | external   | Agent invocation completed             |
| `app.agent.hitl-challenge-issued`    | external   | A tool call is waiting for a person    |
| `app.agent.hitl-challenge-completed` | external   | That person answered                   |
| `app.agent.action-approved`          | external   | Agent action approved                  |
| `app.agent.action-denied`            | external   | Agent action denied                    |
| `app.agent.policy-changed`           | external   | Workspace agent policy changed         |

### Desk

These three are in the foundation catalog in every product, Desk or not; only the optional Desk feature emits them.

| Event                          | Visibility | Meaning                         |
| ------------------------------ | ---------- | ------------------------------- |
| `app.desk.episode-changed`     | internal   | A Desk episode changed state    |
| `app.desk.episode-snoozed`     | internal   | A Desk episode was snoozed      |
| `app.desk.suppression-cleared` | internal   | A Desk entity suppression ended |

## Your product

_How to fill this: one table per aggregate, in the shape above, plus two columns: who emits it (the domain from
`docs/module-map.md`) and who listens. Add each event to `APP_EVENT_REGISTRY` in
`apps/backend/src/platform-glue/events/event-registry.ts` in the same pull request. Name events for what happened
(`app.order.placed`), never for what a listener should do._
