---
owner: foundation
sources:
  - apps/backend/src/domains/support/support.controller.ts#SupportController
  - apps/backend/src/domains/support/support.service.ts#listTicketsForTenant
  - apps/backend/src/domains/support/dto/ticket-list-query.dto.ts#TicketListQueryDto
  - apps/backend/src/domains/support/openapi.responses.ts#SupportTicketListResponse
  - apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts
  - apps/backend/src/platform-glue/events/event-registry.ts#APP_EVENT_REGISTRY
  - apps/backend/src/platform-glue/queue/job-names.ts#APP_JOB_NAMES
  - apps/backend/src/platform-glue/deadlines/deadline-kinds.ts#DEADLINE_KINDS
guards:
  - script:verify
  - script:verify:api
  - script:verify:scaffold
  - api-contract.spec.ts
  - swagger-completeness.spec.ts
---

# Feature checklist: building a feature end to end, and before opening the pull request

The order a vertical slice is built in, each step pointing at its reference. The reference slice is the support desk
(`apps/backend/src/domains/support/` and its tool pair, `apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts`);
where it does not follow a rule yet, the step says what to do instead.

## Walk the slice in order

1. **Schema.** Model in `packages/appshore/db/prisma/schema/app.prisma`, a forward migration, `prisma:generate`, the
   enum mirror committed ([`database.md`](database.md)).
2. **Shapes.** Zod schemas in `packages/shared-types/src/<domain>/`, exported, the package rebuilt
   ([`backend-core.md`](backend-core.md)).
3. **Endpoint.** Controller, DTOs, query DTO, service, serializer, `openapi.responses.ts`; the OpenAPI documents
   regenerated ([`api-contract.md`](api-contract.md), [`errors.md`](errors.md)). The support routes take a numeric
   `:id` from the allowlist; a new aggregate takes its public id.
4. **List.** A cursor list with a public-id tiebreak and a page-walking spec
   ([`lists-and-pagination.md`](lists-and-pagination.md); `SupportService.listTicketsForTenant` is the example).
5. **Event.** A registry entry in `APP_EVENT_REGISTRY`, raised in the write's transaction through the outbox, its
   consumers safe to run twice ([`events-and-outbox.md`](events-and-outbox.md)).
6. **Job or timer.** A job name in `APP_JOB_NAMES` with a `QueueJobHandler`, or a deadline kind in `DEADLINE_KINDS`
   with its handler ([`jobs-and-deadlines.md`](jobs-and-deadlines.md)).
7. **Access.** `@Roles`, record-level checks, the plan gate ([`auth-and-access.md`](auth-and-access.md),
   [`plans-and-entitlements.md`](plans-and-entitlements.md)).
8. **Tool.** A read tool and a write tool through the one pipeline, matching the REST twin's role and plan
   ([`ai-tools.md`](ai-tools.md); copy `support-ticket.tool.ts`).
9. **Web list and form.** The feature folder under `apps/web/src/features/<domain>/`, the list page and the form sheet
   (the `frontend-patterns` skill until the frontend references land).
10. **Tests.** Unit specs per branch, the other-tenant case, run-twice for anything at least once
    ([`testing.md`](testing.md)).

## Before you open the pull request

- [ ] Model, migration and regenerated client and enum mirror are committed together.
- [ ] Every query is scoped by `tenantId`; another tenant's record is a 404; owned records have a record-level check.
- [ ] Every route has `@Roles`, `@HttpCode` on each POST and DELETE, `@ApiOperation`, `@ApiParam`, `@ApiResult`.
- [ ] Every body and query string is a DTO class; fields are camelCase; wire query keys snake_case.
- [ ] No numeric id crosses the API (param, body, response, event, tool, cursor), or it is in the allowlist with a
      reason.
- [ ] Every growing list is a cursor list; every other read is bounded.
- [ ] Errors are NestJS exceptions or api-errors factories; the copy is user-facing; a 400 names its field.
- [ ] Events go through `OutboxService.transaction`; every consumer is idempotent on the event id.
- [ ] Queue work is a handler on an existing dispatcher; job ids come from `bullJobIdFromDbId`; `correlationId` is
      forwarded.
- [ ] No magic strings: enums and constants for statuses, roles, events, queues, cache keys, feature keys.
- [ ] Status transitions go through a method that whitelists `from → to`.
- [ ] Transactions are interactive, parent and children atomic, no external call inside.
- [ ] Plan-gated routes carry `@RequireFeature`; the tool twin carries `@RequiresPlanFeature`.
- [ ] New env vars are in the config schema, `.env.example`, `docs/doppler.md` and, when deployed, Terraform
      (`infra/terraform/`).
- [ ] MCP tools still match the API for every entity the assistant can reach.
- [ ] A binding doc the change makes untrue is amended in this pull request; a changed convention is amended in its
      reference under `.claude/skills/app-conventions/references/`.
- [ ] The OpenAPI documents are regenerated and committed (`pnpm --filter @app/backend openapi:generate`).
- [ ] `pnpm verify` passed on the head commit; its last line is in the pull request body. A change to the wire also has
      the `pnpm verify:api` line; a change to scaffolding or a Desk line outside the Desk folder has the
      `pnpm verify:scaffold` line.

## Flag in review

- A pull request with no `pnpm verify` line, or one whose sha is not the head commit.
- A slice step skipped without a reason (an endpoint with no tool twin, an event with no consumer test).
