---
title: Adding an Endpoint
description: Step-by-step recipe for adding a new endpoint to an existing module — schema, DTO, controller, service, test.
---

# Adding an Endpoint

This recipe walks through adding a new endpoint end-to-end. We'll add a (hypothetical) `GET /v1/desk/responsibilities/:id/episodes` to the existing `DeskResponsibilityController`.

## 1. Define the response schema in `@sally/shared-types`

Schemas live in `packages/shared-types/src/`. Add the new schema there so the frontend, tests, and backend share the same source of truth.

`packages/shared-types/src/desk/responsibility.schema.ts` (or wherever the domain's schemas live):

```ts
import { z } from 'zod';

export const ResponsibilityEpisodeSchema = z.object({
  id: z.string().uuid(),
  responsibilityId: z.string().uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AWAITING_APPROVAL']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  outcomeSummary: z.string().nullable(),
});

export type ResponsibilityEpisode = z.infer<typeof ResponsibilityEpisodeSchema>;

export const ListResponsibilityEpisodesResponseSchema = z.object({
  episodes: z.array(ResponsibilityEpisodeSchema),
  total: z.number(),
});

export type ListResponsibilityEpisodesResponse = z.infer<typeof ListResponsibilityEpisodesResponseSchema>;
```

Use the existing enums (`@/generated/prisma-enums`) when an enum already exists. Never hand-write a `z.enum([...])` for something that's a Prisma enum — see [Standards → Domain Enums](../standards/platform.md#domain-enums-are-prisma-enums).

Build the package so the backend sees the new types:

```bash
pnpm --filter shared-types build
```

## 2. Add the DTO

If the endpoint takes a request body or non-trivial query, add the DTO under the module's `dto/` folder:

```ts
// apps/backend/src/domains/desk/core/responsibility/dto/list-episodes.dto.ts
import { z } from 'zod';

export const ListEpisodesQuerySchema = z.object({
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AWAITING_APPROVAL']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListEpisodesQuery = z.infer<typeof ListEpisodesQuerySchema>;
```

For pure GET endpoints with no input, you can skip the DTO and read `@Query()` directly with primitives.

## 3. Add the controller method

```ts
// apps/backend/src/domains/desk/core/responsibility/responsibility.controller.ts
@Get(':id/episodes')
async listEpisodes(
  @Req() req: AuthenticatedRequest,
  @Param('id') responsibilityId: string,
  @Query() query: ListEpisodesQuery,
): Promise<ListResponsibilityEpisodesResponse> {
  const tenantDbId = this.resolveTenantDbId(req);
  return this.responsibilities.listEpisodes(tenantDbId, responsibilityId, query);
}
```

Notes:

- **`BaseTenantController`** — the class is the standard base for tenant-scoped controllers. `this.resolveTenantDbId(req)` is what gives you the resolved tenant.
- **`@Query()`** binds to a single object, not multiple decorators. The global `ZodValidationPipe` validates against the schema.
- **Response type** matches the shared-types schema — the compiler enforces this.

## 4. Add the service method

```ts
// apps/backend/src/domains/desk/core/responsibility/responsibility.service.ts
async listEpisodes(
  tenantDbId: number,
  responsibilityId: string,
  query: ListEpisodesQuery,
): Promise<ListResponsibilityEpisodesResponse> {
  const where = {
    tenant_db_id: tenantDbId,
    responsibility_id: responsibilityId,
    ...(query.status && { status: query.status }),
  };

  const [episodes, total] = await Promise.all([
    this.prisma.deskEpisode.findMany({
      where,
      orderBy: { started_at: 'desc' },
      take: query.limit,
      skip: query.offset,
      select: {
        id: true,
        responsibility_id: true,
        status: true,
        started_at: true,
        ended_at: true,
        outcome_summary: true,
      },
    }),
    this.prisma.deskEpisode.count({ where }),
  ]);

  return {
    episodes: episodes.map((e) => ({
      id: e.id,
      responsibilityId: e.responsibility_id,
      status: e.status,
      startedAt: e.started_at.toISOString(),
      endedAt: e.ended_at?.toISOString() ?? null,
      outcomeSummary: e.outcome_summary,
    })),
    total,
  };
}
```

The mapping at the bottom is the camelCase boundary — Prisma gives you `snake_case`, you return `camelCase`. Always.

## 5. Write the spec first (TDD)

Co-locate at `apps/backend/src/domains/desk/core/responsibility/__tests__/responsibility.service.spec.ts`:

```ts
describe('DeskResponsibilityService.listEpisodes', () => {
  let service: DeskResponsibilityService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      deskEpisode: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new DeskResponsibilityService(prisma);
  });

  it('returns episodes scoped to tenant and responsibility', async () => {
    prisma.deskEpisode.findMany.mockResolvedValue([
      {
        id: 'ep-1',
        responsibility_id: 'r-1',
        status: 'COMPLETED',
        started_at: new Date('2026-05-20T10:00:00Z'),
        ended_at: new Date('2026-05-20T10:05:00Z'),
        outcome_summary: 'done',
      },
    ]);
    prisma.deskEpisode.count.mockResolvedValue(1);

    const result = await service.listEpisodes(42, 'r-1', { limit: 20, offset: 0 });

    expect(prisma.deskEpisode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_db_id: 42, responsibility_id: 'r-1' },
      }),
    );
    expect(result).toEqual({
      episodes: [
        {
          id: 'ep-1',
          responsibilityId: 'r-1',
          status: 'COMPLETED',
          startedAt: '2026-05-20T10:00:00.000Z',
          endedAt: '2026-05-20T10:05:00.000Z',
          outcomeSummary: 'done',
        },
      ],
      total: 1,
    });
  });
});
```

Run:

```bash
pnpm backend:test -- --testPathPattern responsibility.service.spec
```

Watch it fail (red), then implement (green), then refactor.

## 6. Emit a DomainEvent if the endpoint causes state change

`GET` doesn't, but if you're adding a `POST` or `PATCH`, after the state change emit:

```ts
this.eventBus.emit(
  new DomainEvent(
    'desk.episode.approved',
    String(tenantDbId),
    { episodeId, approvedByUserId: actor.id },
  ),
);
```

See [Events & Queues](events-queues.md) for the full pattern.

## 7. Open the Swagger UI

Backend dev server exposes `http://localhost:8001/api`. New endpoint should show up there. If it doesn't, you probably forgot to register the controller in the module's `controllers:` array.

## 8. Commit + PR

```bash
git checkout -b feat/desk-list-responsibility-episodes
# … work …
pnpm format:check && pnpm lint && pnpm type-check && pnpm backend:test
git add -A
git commit -m "feat(desk): list episodes for a responsibility"
git push -u origin feat/desk-list-responsibility-episodes
gh pr create --base develop --title "feat(desk): list episodes for a responsibility"
```

See [Getting Started → Your First PR](../getting-started/first-pr.md) for the rest of the PR flow.
