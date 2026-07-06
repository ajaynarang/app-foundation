---
name: backend-patterns
description: Use when implementing, modifying, reviewing, or planning any backend feature in this NestJS/Prisma monorepo — domain modules, controllers, services, DTOs, Prisma models, caching, events, queues, error handling, AI invocation, integrations. Applies to apps/backend and the @appshore/* foundation packages.
---

# Backend Patterns

Authoritative reference for all backend conventions. Every new domain, service, or feature MUST follow these patterns.

Examples below use a neutral demo domain (projects / tasks / notifications). Substitute your own entities — the patterns are what matter.

---

## 0. Code Quality Principles (read first — override defaults, apply to ALL backend code)

These principles take precedence over convenience, speed, or mimicking existing code that violates them. If existing code in the repo breaks these rules, the right move is to improve it while you're there — not copy the violation.

### SOLID

- **Single Responsibility** — one class, one reason to change. If a service handles "users + audit logging + email notifications", split it. If a class name contains "and" or "manager" or "util" without a sharper noun, it's doing too much.
- **Open/Closed** — extend by adding new code, not modifying existing code. Prefer registering new capabilities/providers/strategies in a module over adding `if (type === 'x')` branches to existing code. The event registry, MCP tool registry, and Desk responsibility registry are the canonical examples.
- **Liskov Substitution** — a subtype must honor its supertype's contract. Don't throw `NotImplementedException` in an override. Don't narrow an input type or widen an output type silently.
- **Interface Segregation** — clients shouldn't depend on methods they don't use. A service that injects `UsersService` only to call `getUserById()` signals we need a thinner interface or a finder service.
- **Dependency Inversion** — depend on abstractions at module boundaries. In NestJS this is natural via constructor injection. The concrete form: inject services via DI, never `new SomeService()` in business code.

### KISS — Keep It Simple, Stupid

- Straightforward code > clever code. A junior engineer should understand the method on first read.
- No speculative generality. Don't build `Foo<T, U extends Bar, R>` unless a second caller demands it today.
- No hidden control flow. Avoid magic (deep decorator chains, implicit globals, `eval`-like dynamic dispatch).
- Prefer explicit `if`/`return` to clever short-circuits that require mental parsing.

### DRY — Don't Repeat Yourself, but…

- Extract shared logic when it appears **three times** with the same intent. Two occurrences is a coincidence; three is a pattern.
- **Rule of three applies to intent, not shape.** Two blocks that look similar but express different intents must stay separate — premature DRY creates coupling that hurts later.
- Duplicate code that's drifting apart is a signal each variant needs its own name, not one shared helper.

### YAGNI — You Aren't Gonna Need It

- No features, flags, config knobs, or abstractions "for the future". Build for what we need today, refactor when the future arrives.
- No dead parameters "in case we need them later" — they rot.

### Method Length

- **Target ≤ 60 lines per method.** Soft ceiling ≈ 100 lines (excluding signature/braces). Past that, look hard for distinct steps that deserve names — but don't split mechanically if the method is genuinely a single linear pipeline or a flat mapper.
- Extract private helpers when they sharpen the reading order (`fetchX → validate → compute → persist`), not just to hit a number.
- Common exceptions that are fine long: switch/case dispatchers, DTO → entity mappers, orchestration methods that are pure sequence with no branching, SQL/Prisma query builders.

### Class/File Length

- **Target ≤ 500 lines per file.** Soft ceiling ≈ 800. Past that, split along responsibility lines (see SRP) — but only when clear seams exist (multiple unrelated concerns, not one cohesive concept).
- A controller with 15 endpoints is fine. A service with 25+ public methods covering unrelated concerns probably isn't.
- Don't split a cohesive service just to hit a line count. Splitting for the sake of splitting creates indirection without clarity.

### Naming

- **Classes**: `PascalCase`, nouns. `TaskAssignmentService`, not `AssignTask` or `TaskAssigner`.
- **Methods**: `camelCase`, verbs. `fetchProject()`, `isOverdue()`, `buildDigestPayload()`. Boolean methods start with `is`/`has`/`should`.
- **Services** end in `Service`. **Processors** in `Processor`. **Executors** in `Executor`. **Registrars** in `Registrar`. Match the role, don't invent new suffixes.
- **Files**: `kebab-case.role.ts` — `task-assignment.service.ts`, `projects.controller.ts`. Role suffix always present.
- **Variables**: intention-revealing. `pendingCount` not `count` when ambiguous; `idleWorkers` not `arr`. Avoid generic `data`, `info`, `obj` unless the context is unambiguous (DTOs, event payloads).
- **Constants**: `SCREAMING_SNAKE_CASE`. Export from a dedicated `constants.ts` or the module that owns the concept.
- **Event names**: `app.<aggregate>.<past-tense-action>` — `app.project.created`, `app.task.status-changed`. Always past tense for facts.
- **Avoid**: `Manager`, `Helper`, `Util`, `Handler` without a sharper noun. `Data`, `Info`, `Obj` as type names. Hungarian notation. Abbreviations that aren't universal.
- **Schema-level column naming** (Prisma fields, FK columns, `*Number` business IDs, `<verb>At` timestamps, `*Cents` money, etc.): see [`column-naming.md`](./column-naming.md).

### Comments

- **Default: don't write comments.** Good names + short methods remove the need.
- **Write a comment when WHY is non-obvious**: a workaround for a specific bug, a subtle invariant, a regulatory constraint, a performance trick.
- **Never comment WHAT the code does** — if you feel you need to, the code isn't clear enough. Refactor.
- **Never leave commented-out code.** Delete. Git has the history.
- **JSDoc only at public API boundaries** (exported service methods, DTOs with non-obvious fields). Internal helpers usually don't need it.

### Error Handling

- **Fail loud at system boundaries** — controllers, external API calls, message handlers. Throw NestJS exceptions (`BadRequestException`, `NotFoundException`, `ForbiddenException`, `InternalServerErrorException`). Never `throw new Error()` in an HTTP path.
- **No silent `.catch(() => {})`** except in genuinely optional side-effects (counter increments, telemetry). Log at minimum.
- **Don't validate what can't fail.** If a field is typed `string` and comes from a validated DTO, don't re-check `!= null`.
- **Validate at the boundary** (DTO via Zod/class-validator), then trust the type system internally. Avoid defensive duplicate validation.

### Testing

- **Coverage target: 90%+ for new backend code.**
- One `describe` per class. One `it` per behavioral branch. Test names describe the behavior (`it('skips when task is already assigned')`), not the implementation.
- Arrange → Act → Assert inside each test. Keep them independent — no shared mutable fixtures between tests in a `describe`.
- Mock at module boundaries (services, Prisma, external clients). Don't mock internal helpers. Use the shared fixtures from `@appshore/platform/test/*` (e.g. `createMockPrisma`).
- **No snapshot tests for business logic.** Fine for DTO shapes, not fine for "what the service does."

### Dependencies & Imports

- **Layer rule (CI-enforced by `apps/backend/src/architecture/foundation-boundaries.spec.ts`):** `kernel ← db ← platform ← apps`. Foundation packages (`@appshore/*`) never import app code.
- **Direction inside the app**: domains → platform-glue/foundation/shared. Never the reverse. Domain A → Domain B is allowed only if B is an explicit dependency in A's module imports.
- **Circular deps are a design smell.** If you reach for `forwardRef`, pause — is there a third concept that should own the shared state? Accept `forwardRef` only when the cycle is genuinely unbreakable.
- **Prefer composition over inheritance.** Classes exist for DI, rarely for type hierarchies.

### Immutability & Purity

- Inputs to methods should not be mutated unless explicitly documented.
- Prefer `readonly` on class fields and DTO properties.
- Pure functions (no DB, no HTTP) are easier to test — push I/O to the edges.

### What to call out in review

When reviewing code (yours or others'), flag these as CRITICAL / CONVENTION violations:

- Method > 50 lines → **split**.
- File > 500 lines → **split along responsibility**.
- "Manager", "Helper", "Util" in a class name without a sharper noun → **rename**.
- `throw new Error(...)` in an HTTP handler → **use NestJS exception**.
- `.catch(() => {})` without a comment explaining why → **log or rethrow**.
- Dead `_unused`, commented-out code, TODO without owner → **remove**.
- `any` type without justification → **type it**.
- Copy-pasted block (3rd occurrence) → **extract**.
- Deep ternary (`a ? b ? c : d : e`) → **switch/if**.
- Comment that repeats what the code says → **delete the comment**.

---

## Architecture Overview

```
apps/backend/src/
  domains/           # YOUR business domains + the generic ones (billing, notifications,
                     # support, admin, feedback, ai, desk, prompting, integrations)
  platform-glue/     # App-side composition: event registry, queue topology, SSE bridge,
                     # outbound webhooks, cache invalidation map, lifecycle hooks
  architecture/      # CI guardrail specs (layer boundaries, enum parity, queue rules)
packages/appshore/
  kernel/            # @appshore/kernel — DB-free mechanics: logging, event/queue/cache
                     # mechanics, retry, SSE/SMS transport, telemetry, utils
  db/                # @appshore/db — THE Prisma package: multi-file schema, generated
                     # client, migrations, seeds, enum codegen
  platform/          # @appshore/platform — Prisma-coupled SaaS foundation: auth/tenancy
                     # guards, database, cache, queue persistence, storage, notifications,
                     # platform domains (users, tenants, plans, flags, api-keys, oauth)
```

Each domain has an aggregate module (e.g., `billing.module.ts`) that imports/exports sub-modules. New business domains go under `apps/backend/src/domains/<your-domain>/`.

---

## 1. Module Structure

```typescript
@Module({
  imports: [PrismaModule, CacheModule, EventBusModule, QueueModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService], // Export if other domains need it
})
export class ProjectsModule {}
```

**Rules:**

- Register in the parent domain module (`imports` AND `exports`)
- Import only what you need (PrismaModule is always needed)
- Add CacheModule if using `AppCacheService`
- Add EventBusModule if emitting domain events
- Add QueueModule if using BullMQ queues

---

## 2. Controller Patterns

```typescript
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {
    super(prisma);
  }

  @Get()
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List projects' })
  async list(@CurrentUser() user: any, @Query('status') status?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.projectsService.findAll(tenantDbId, { status });
  }

  @Get(':project_id')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiParam({ name: 'project_id' })
  async getOne(@Param('project_id') projectId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.projectsService.findOne(projectId, tenantDbId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create project' })
  async create(@CurrentUser() user: any, @Body() dto: CreateProjectDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.projectsService.create(tenantDbId, dto);
  }
}
```

**Decorator checklist (every endpoint):**

- `@Roles(...)` — RBAC (use the `UserRole` enum from `@appshore/db`: `OWNER`, `ADMIN`, `MEMBER`, `SUPER_ADMIN`)
- `@ApiOperation({ summary: '...' })` — Swagger docs
- `@ApiParam(...)` — on any `:param` endpoint
- `@RequireFeature('feature_key')` — if behind a feature flag

**`BaseTenantController` utilities** (`@appshore/platform`, `shared/base/base-tenant.controller.ts`):

- `getTenantDbId(user)` — resolves JWT tenant string to DB numeric ID
- `getUserDbId(userId)` — resolves JWT user string to DB numeric ID
- `validateTenantAccess(resourceTenantId, userTenantId)` — cross-tenant check

**URL param naming:** snake_case in URL (`:project_id`), camelCase in the TS variable.

**Self-service routes:** prefix with `/my-{entity}` and scope by the user id from the JWT.

### 2.1 Record-Level Authorization (beyond `@Roles`)

Roles answer "is this user allowed to call this endpoint." They do NOT answer "is this user allowed to see THIS record." Add a record-level check whenever a resource has scoped ownership.

| Resource scope       | Check                                      |
| -------------------- | ------------------------------------------ |
| Member-assigned task | `task.assigneeId === user.userDbId`        |
| User's own profile   | `target.userId === user.userId`            |
| Workspace-owned item | `item.workspaceId === session.workspaceId` |

`@Roles(UserRole.MEMBER)` lets a member hit the tasks endpoint; the record-level check is what stops member A from reading member B's private record. Both are required — never just one. **RBAC-forbidden → 403; different-tenant record → 404** (don't leak existence).

### 2.2 Feature Flag Gating

Apply `@RequireFeature(FEATURE_KEYS.X)` at the controller method (or class), AFTER `@Roles`. Order matters: roles fail fast (cheap), the feature flag check hits the feature-flags cache. Feature keys live in `packages/shared-types/src/platform/feature-keys.ts`.

**Don't gate at the service layer.** Services are called by other domains (jobs, AI tools, internal triggers) that legitimately bypass tenant feature flags. Keep gating at the HTTP boundary.

---

## 3. Service Patterns

```typescript
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly events: DomainEventService,
  ) {}

  async findAll(tenantId: number, filters?: ProjectFilters) {
    const where: Prisma.ProjectWhereInput = { tenantId };
    if (filters?.status) where.status = filters.status;
    // Dynamic WHERE building for optional filters

    return this.prisma.project.findMany({
      where,
      include: {
        /* related data */
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(projectNumber: string, tenantId: number) {
    const project = await this.prisma.project.findFirst({
      where: { projectNumber, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(tenantId: number, data: CreateProjectDto, actor?: EventActor) {
    const project = await this.prisma.project.create({
      data: { ...data, tenantId },
    });

    await this.events.emit(
      DOMAIN_EVENTS.PROJECT_CREATED,
      tenantId,
      {
        projectNumber: project.projectNumber,
      },
      actor,
    );

    return project;
  }
}
```

**Rules:**

- EVERY query MUST scope by `tenantId`
- Use `Logger` with class name: `new Logger(ClassName.name)`
- Throw standard NestJS exceptions: `NotFoundException`, `BadRequestException`, `ConflictException`, `ForbiddenException`
- State machine transitions: validate current status before updating (see §3.1)
- Emit through `DomainEventService` (from `@appshore/kernel`) — never raw `EventEmitter2.emit` (see §8.1)
- Always pass pagination through `clampPagination()` (`@appshore/kernel`, `shared/utils/pagination.ts`) before hitting the DB — never accept `limit`/`offset` raw

### 3.1 State Machine Transitions

Status changes are not free-form updates. Every status transition belongs in a dedicated method (or sub-service like `TaskStatusService`) that whitelists the allowed `from → to` set.

```typescript
async updateStatus(taskId: number, tenantId: number, next: TaskStatus, actor: EventActor) {
  const task = await this.findOne(taskId, tenantId);
  this.assertTransition(task.status, next);   // throws BadRequestException on illegal transition
  const updated = await this.prisma.task.update({ where: { id: task.id }, data: { status: next } });
  await this.events.emit(DOMAIN_EVENTS.TASK_STATUS_CHANGED, tenantId, { taskId, from: task.status, to: next }, actor);
  return updated;
}

private assertTransition(from: TaskStatus, to: TaskStatus) {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    OPEN:        [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
    IN_PROGRESS: [TaskStatus.BLOCKED, TaskStatus.DONE, TaskStatus.CANCELLED],
    BLOCKED:     [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
    DONE:        [],
    CANCELLED:   [],
  };
  if (!allowed[from]?.includes(to)) {
    throw new BadRequestException(`Cannot move from ${from} to ${to}`);
  }
}
```

**Never** allow arbitrary `update({ status: anything })` from a generic `update()` method — it bypasses the rule and corrupts state.

### 3.2 Fire-and-Forget Side Effects

Notifications, audit logs, telemetry, and any side effect that doesn't affect the response should NOT block the main flow:

```typescript
this.notificationTriggers
  .taskAssigned(tenantId, task)
  .catch((err) => this.logger.warn(`notify failed: ${err.message}`));
```

**Rules:**

- The hot path is `events.emit()` — that's already non-blocking.
- For separate DB writes that aren't part of the main transaction (audit log entries, log tables), wrap in `.catch()` with a logger warn so a failure doesn't 500 the response.
- Don't `.catch(() => {})` silently — log at minimum. Silent swallow turns a known failure into a mystery.
- If the side effect MUST succeed (charge customer, persist invoice), it's not a side effect — it's part of the main flow. Put it in the transaction or fail the request.

---

## 4. DTO Patterns (class-validator)

```typescript
export class CreateProjectDto implements CreateProjectInput {
  @ApiProperty({ example: 'Website Redesign' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ProjectKindSchema.options })
  @IsIn(ProjectKindSchema.options)
  kind: ProjectKind;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim() || undefined)
  notes?: string;

  @ApiProperty({ example: 10000, description: 'Budget in cents' })
  @IsNumber()
  @IsInt()
  @Min(0)
  budgetCents?: number;

  @ApiProperty({ type: [CreateTaskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks: CreateTaskDto[];
}
```

**Rules:**

- DTOs `implement` the shared-types Zod-inferred interface (e.g., `implements CreateProjectInput`)
- Every field gets `@ApiProperty()` for Swagger
- `@Transform(({ value }) => value?.trim() || undefined)` on optional strings
- Money always in cents with `@IsInt()` and `@Min(0)`
- Nested objects use `@ValidateNested({ each: true })` + `@Type(() => SubDto)`
- All DTO fields are **camelCase** (NON-NEGOTIABLE — see CLAUDE.md)

---

## 5. Shared Types (Zod in `packages/shared-types/`)

```typescript
// packages/shared-types/src/{domain}/{entity}.schema.ts
import { z } from 'zod';

// Full entity (response shape)
export const ProjectSchema = z.object({
  id: z.number(),
  projectNumber: z.string(),
  name: z.string(),
  status: ProjectStatusSchema, // generated Prisma-enum mirror — do NOT hand-write
  budgetCents: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

// Create input
export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  budgetCents: z.number().int().min(0).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

// Update input
export const UpdateProjectSchema = CreateProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
```

**Then export from `packages/shared-types/src/index.ts`** and rebuild (`pnpm --filter @app/shared-types build` — dependents consume its dist).

**Naming conventions:**

| Type         | Pattern                 | Example                |
| ------------ | ----------------------- | ---------------------- |
| Full entity  | `{Entity}Schema`        | `ProjectSchema`        |
| Create input | `Create{Entity}Schema`  | `CreateProjectSchema`  |
| Update input | `Update{Entity}Schema`  | `UpdateProjectSchema`  |
| Summary      | `{Entity}SummarySchema` | `ProjectSummarySchema` |

**Data conventions:**

- Money: always cents (integers), suffix `Cents` (e.g., `budgetCents`, `totalCents`)
- Timestamps: ISO 8601 strings
- Nullable optional: `.nullable().optional()`
- Batch limits: `.max(50)` on arrays
- Status/role/type enums: NEVER hand-write a Zod enum that mirrors a Prisma enum — import from the generated mirror (`packages/shared-types/src/generated/prisma-enums.ts`); `no-duplicate-zod-enums.spec.ts` enforces this

---

## 6. Prisma Schema Patterns

Models live in `packages/appshore/db/prisma/schema/` — **`foundation.prisma`** is the platform's (don't edit for app features); **`app.prisma`** is YOUR extension point.

```prisma
model Project {
  id             Int      @id @default(autoincrement())
  projectNumber  String   @map("project_number") @db.VarChar(50)  // public business ID — see id-convention.md
  name           String   @map("name") @db.VarChar(200)
  status         ProjectStatus @default(DRAFT)
  budgetCents    Int?     @map("budget_cents")
  metadata       Json?    @map("metadata")

  // Multi-tenant isolation (REQUIRED)
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  tenantId  Int      @map("tenant_id")

  // Timestamps (REQUIRED)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // External sync fields (if synced from a third-party system)
  externalId     String?   @map("external_id") @db.VarChar(100)
  externalSource String?   @map("external_source") @db.VarChar(50)
  lastSyncedAt   DateTime? @map("last_synced_at") @db.Timestamptz

  @@unique([projectNumber, tenantId])
  @@index([tenantId])
  @@index([tenantId, status])
  @@map("projects")
}
```

**Rules — see [`id-convention.md`](./id-convention.md) and [`column-naming.md`](./column-naming.md) for the canonical version.**

- Model names: singular PascalCase. Table names: plural snake_case via `@@map()`
- Fields: camelCase. Columns: snake_case via `@map()`
- Every tenant-scoped model gets `tenantId`, `createdAt`, `updatedAt`
- Use `@db.Timestamptz` for all timestamps; `@db.Date` for calendar dates (due dates, issue dates)
- Financial amounts: `Int` (cents), never `Decimal`/`Float` for line-item amounts
- Use `Json` for flexible unstructured data (with a documented shape)
- Enums defined in the schema — the single source of truth (see §6.4)
- Composite unique: `@@unique([projectNumber, tenantId])`
- **PK strategy**: `Int autoincrement` for operational entities; UUIDv7 for audit/event/log tables. CUID is banned for new tables.
- **Public business ID**: `<entity>Number` (e.g. `projectNumber`, `invoiceNumber`) — never a redundant `<entity>Id String` column.
- **Tokens**: never on the entity row. Live in dedicated `*ShareLink` / `*Token` / `*Key` tables.
- **FKs target `id`**: `references: [id]` always. Never reference a slug, business number, or other non-PK column.
- After schema changes: always create a migration

**Migration workflow:**

```bash
cd apps/backend
pnpm prisma:generate          # regenerates Prisma client + shared-enum mirror
pnpm prisma:migrate           # prisma migrate dev (local)
pnpm prisma:migrate:deploy    # apply committed migrations (CI/prod)
```

(These delegate to `@appshore/db` — the db package owns the schema, migrations, and seeds.)

- Keep migrations additive when possible (new tables, new nullable columns) — breaking changes (column drops) should be separate, deferred migrations
- Backfill migrations should be separate from schema migrations
- When adding new models, extend the mock Prisma model list in `@appshore/platform/test/mocks/prisma.mock` if the tests need it

**ID generation — see [`id-convention.md`](./id-convention.md) (canonical).**

Five roles, summarized:

| Role                          | Type                                                                    | Where                               |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| Internal PK — operational     | `Int @id @default(autoincrement())`                                     | Project, Task, Invoice, User, etc.  |
| Internal PK — audit/event/log | `String @id` with a UUIDv7 helper (time-sortable)                       | event logs, delivery logs, episodes |
| Public business identifier    | `String`, sequence-derived (`PRJ-...`, `INV-...`) on a `*Number` column | `Project.projectNumber`             |
| Tenant URL slug               | `String`, hand-picked, on the tenant only                               | tenant routing                      |
| Opaque token                  | `nanoid(22)`, in a dedicated `*ShareLink` / `*Token` / `*Key` table     | share links, API keys, reset tokens |

**Counter service pattern** (`CounterService` in `@appshore/platform`, `infrastructure/database/counter.service.ts`) for sequence-derived business identifiers:

```typescript
// Atomic UPSERT — race-free sequential numbering
const seq = await this.counterService.nextValue(tenantId, `project:${dateStr}`);
const projectNumber = `PRJ-${dateStr.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;
```

Counter keyed by `(tenantId, key)`, incremented inside a Postgres UPSERT. Two concurrent `create` requests in the same tenant get distinct sequence numbers — no double-issue. Date-partitioned keys keep counters bounded and produce human-readable IDs.

### 6.1 Multi-Entity Composition (parent + children + dedup)

Creating a parent with children (a project with tasks and members) follows three phases:

1. **Resolve external entities OUTSIDE the transaction** — look up referenced records, generate the business number, dedupe children. Anything that does its own DB call but doesn't need to be atomic with the create.
2. **Atomic batch in `prisma.$transaction`** — `prisma.project.create({...})`, then `prisma.task.createMany({...})` — all or nothing.
3. **Denormalize after commit** — backfill cached cross-relation fields (counts, "next due task"). Done post-tx because it can re-read consistent state.

**Child deduplication:** if the same referenced row would be linked twice with independent lifecycles, clone it instead of double-linking — two FKs to the same row mean status changes on one accidentally affect the other.

**Why three phases (not one giant tx)?** Long transactions hold row locks. Resolution + denormalization don't need to be atomic with the create — keep the tx short and focused on writes that must succeed or fail together.

### 6.2 Transaction Patterns & FK-Safe Order

**Creating:** parent first, children next, all in one `$transaction`. `createMany` for child collections instead of N `create` calls.

**Deleting:** children first, parent last. Order matters because of FK constraints.

```typescript
// FK-safe delete — leaf tables before referenced tables
await this.prisma.$transaction([
  this.prisma.taskComment.deleteMany({ where: { projectId, tenantId } }),
  this.prisma.task.deleteMany({ where: { projectId, tenantId } }),
  this.prisma.project.delete({ where: { id: projectId } }),
]);
```

**Don't put external API calls inside `$transaction`.** They hold row locks, can hang on network, and rollback doesn't undo the external side effect. Sequence:

```typescript
// 1. local atomic write
const project = await this.prisma.$transaction(async (tx) => { ... });
// 2. external call after commit
await this.accountingAdapter.syncInvoice(project.id);   // crash here = retryable, not corrupt
```

**Use `upsert`, not "find then create".** `findUnique → if null → create` is racy under concurrency.

```typescript
// BAD — two requests can both find null and both create
const existing = await this.prisma.foo.findUnique({ where: { tenantId_key: ... }});
if (!existing) await this.prisma.foo.create({ ... });

// GOOD — atomic
await this.prisma.foo.upsert({ where: { tenantId_key: ... }, create: {...}, update: {} });
```

### 6.3 N+1 Query Prevention

- Batch creates: `createMany`, not loops of `create`.
- Batch updates: `updateMany`, or a single SQL `UPDATE … FROM (VALUES …)` via `$executeRaw` if you need per-row values.
- Eager-load relations with `include` / `select` rather than fetching the parent then looping to fetch children.
- For read endpoints that return lists, prefer one query with `include` over N detail-fetch round-trips.

### 6.4 Domain Enums (NON-NEGOTIABLE)

**All domain enums** — status, role, type, priority, severity, category, etc. — **are defined as Prisma enums in `packages/appshore/db/prisma/schema/*.prisma`. One source of truth: the schema.** Both layers consume it differently:

- **Backend** imports the typed enum from **`@appshore/db`** (never `@prisma/client` directly):
  ```ts
  import { TaskStatus, UserRole } from '@appshore/db';
  where: {
    status: TaskStatus.DONE;
  }
  ```
- **Frontend/shared-types** import the auto-generated mirror from `packages/shared-types/src/generated/prisma-enums.ts` (re-exported by `@app/shared-types`):
  ```ts
  import { TaskStatus } from '@app/shared-types';
  if (task.status === TaskStatus.DONE) { … }
  ```

The mirror is generated by the db package's `scripts/generate-shared-enums.ts`, chained into `pnpm --filter @appshore/db prisma:generate`. **Never hand-edit `prisma-enums.ts`** — `enum-codegen-parity.spec.ts` fails CI if it drifts.

**Forbidden:**

- `String @db.VarChar` columns whose name suggests an enum (`status`, `role`, `type`, `kind`, `priority`, `severity`, `category`, `tier`, `mode`, `stage`, `method`, `channel`, `scope`, `level`).
- Hand-written `'UPPER_LITERAL'` next to enum-typed fields. Always import the typed enum.
- Hand-maintained Zod enums duplicating a Prisma enum.

**CI guardrails** (all under `apps/backend/src/architecture/`):

1. `enum-codegen-parity.spec.ts` — generated mirror must match the schema.
2. `schema-enum-conventions.spec.ts` — no String-typed enum-shaped columns (exceptions in `ALLOWED_STRING_COLUMNS`).
3. `status-call-sites.spec.ts` — no lowercase string literals next to status fields.
4. `no-duplicate-zod-enums.spec.ts` — hand-written `z.enum(...)` in shared-types cannot share a name with a generated Prisma enum schema.

**Adding a new enum value:** edit the schema → `pnpm prisma:generate` (regenerates client + mirror) → use `EnumName.MEMBER` on both sides → commit the schema AND the regenerated `prisma-enums.ts`.

**Adding a new domain enum:** define it in the schema (`enum ProjectKind { INTERNAL, CLIENT }`), use it as the column type (never `String @db.VarChar`), write a migration with `CREATE TYPE` + `ALTER COLUMN`, regenerate.

Open-set, tenant-defined `category`-style columns may stay `String` — document them in `ALLOWED_STRING_COLUMNS`.

---

## 7. Caching Patterns

**TTL tiers** (constants in `@appshore/kernel`, `constants/cache.constants.ts`):

| Tier   | TTL      | Constants                   | Use For                                |
| ------ | -------- | --------------------------- | -------------------------------------- |
| HOT    | 15-60s   | `CACHE_TTL_HOT_15S/30S/60S` | Real-time data, event-invalidated      |
| WARM   | 2-10min  | `CACHE_TTL_WARM_2M/5M/10M`  | Operational data, mutation-invalidated |
| COLD   | 10-30min | `CACHE_TTL_COLD_10M/30M`    | Config data, rarely changes            |
| FROZEN | 1h-24h   | `CACHE_TTL_FROZEN_1H/24H`   | Reference data, nearly static          |

**Cache key building** (`buildKey` from `@appshore/kernel`, `infrastructure/cache/cache-key.constants.ts`; namespaces registered in `CACHE_NAMESPACES`):

```typescript
buildKey('app:project', 'detail', tenantId, projectNumber);
// → 'app:project:detail:123:PRJ-20260706-001'
```

**Pattern 1 — getOrSet (most common):**

```typescript
return this.cache.getOrSet(
  buildKey('app:project', 'detail', tenantId, projectNumber),
  async () => this.prisma.project.findFirst({ where: { projectNumber, tenantId } }),
  CACHE_TTL_WARM_5M,
);
```

**Pattern 2 — Invalidate after mutation:**

```typescript
await this.cache.del(buildKey('app:project', 'list', tenantId));
```

**Pattern 3 — Event-based invalidation** (in `apps/backend/src/platform-glue/cache/cache-invalidation.subscriber.ts`):

```typescript
// Add cases to the event → keys map for new events
case DOMAIN_EVENTS.PROJECT_CREATED:
  keys.push(buildKey('app:project', 'list', tenantId));
  break;
```

**Stampede prevention:** `AppCacheService.getOrSet` uses distributed locks (Redis SET NX+EX) and a null sentinel so legitimately-null values don't cause refetch loops. Don't reinvent this.

**Never** wrap `getOrSet` in another `getOrSet` — that's a deadlock. If a value depends on another cached value, fetch the dependency outside the outer `getOrSet`.

---

## 8. Domain Events

**Event naming:** `app.<aggregate>.<past-tense-action>` (e.g., `app.project.created`).

**Registry-driven (the extension point):** add entries to `APP_EVENT_REGISTRY` in `apps/backend/src/platform-glue/events/event-registry.ts`. The `DOMAIN_EVENTS` constants derive automatically in `domain-events.constants.ts` — `DOMAIN_EVENTS.PROJECT_CREATED` is typed as the literal `'app.project.created'`. The foundation's own catalog lives in `@appshore/kernel` (`foundation-events`).

```typescript
export const APP_EVENT_REGISTRY = [
  {
    key: 'app.project.created',
    constantName: 'PROJECT_CREATED',
    label: 'Project created',
    description: 'A project was created',
    category: 'Projects',
    visibility: 'external', // external events appear in the webhook catalog
  },
] as const satisfies readonly EventDefinition[];
```

**When adding new events, update ALL of these:**

1. `platform-glue/events/event-registry.ts` — the registry entry
2. `platform-glue/cache/cache-invalidation.subscriber.ts` — cache keys to invalidate
3. `platform-glue/sse/domain-event-sse-bridge.service.ts` — map domain event → SSE event
4. `packages/shared-types` — SSE event type (infrastructure schemas)
5. `packages/appshore/web-core/src/shared/realtime/invalidation-map.ts` — map SSE event → query keys

### 8.1 Hot Path vs Durable Path (every emit goes through both)

`DomainEventService.emit()` (`@appshore/kernel`, `infrastructure/events/domain-event.service.ts`) fans every event into two pipelines:

- **Hot path** — synchronous `EventEmitter2.emit()`. Listeners: cache invalidation subscriber, SSE bridge, in-process `@OnEvent` handlers. Instant, in-process. Failures here are non-fatal — log and move on.
- **Durable path** — `BullMQ.add(QUEUE_NAMES.EVENTS, …)`. Processed by the durable event processor (`platform-glue/events/durable-event.processor.ts`) for persistence + outbound webhook dispatch. Crash-safe and cross-instance. If enqueue fails, the hot path has already delivered — log a warning, don't throw.

```typescript
// Always use the service, NOT eventEmitter.emit() directly
await this.events.emit(
  DOMAIN_EVENTS.PROJECT_CREATED,
  tenantId,
  { projectNumber, ...payload },
  actor, // optional — who triggered this
  { correlationId, causationId }, // optional — request correlation
);
```

**Rules:**

- Inject `DomainEventService` (alias `events`), not raw `EventEmitter2`. The service owns both paths and the `DomainEvent` envelope construction.
- Never `await` slow listeners on the hot path — they'll block the response. Heavy work (dispatch, ML, external calls) belongs in the durable processor or its own queue.
- Listeners that NEED durability (webhooks, audit persistence) subscribe on the durable processor, not the hot bus.
- Listeners that CAN be lossy (cache busting — re-fetched on next read; SSE — clients reconnect) live on the hot bus.

### 8.2 SSE Bridge — Tenant vs User Scope

The SSE bridge (`platform-glue/sse/domain-event-sse-bridge.service.ts`) translates domain events to SSE events and decides who receives them. Two scopes:

- **Tenant-scoped** (default) — broadcasts to every connection authenticated as that tenant. Use for shared workspace data.
- **User-scoped** — payload includes `recipientUserIds: string[]`. The bridge unicasts to those users only and **strips `recipientUserIds` before serialization** so the routing field never reaches the wire. Use for personal notifications, private chat updates, AI results.

When adding a new domain → SSE mapping, decide scope first. Tenant-scoped events with leaked PII (e.g. user emails) are a privacy bug — pick user-scope and use `recipientUserIds`.

---

## 9. BullMQ Queue Patterns

**Queue topology** — queues are grouped by failure-domain tier. Source of truth: `@appshore/kernel`, `infrastructure/queue/queue.constants.ts`.

| Tier                             | Queue            | Purpose                                            |
| -------------------------------- | ---------------- | -------------------------------------------------- |
| 1 — Real-time (humans waiting)   | `events`         | Durable event bus, fan-out spine                   |
|                                  | `notifications`  | Outbound SMS/push/email/in-app (priority enforced) |
|                                  | `webhooks`       | Outbound webhooks to customer systems              |
| 2 — Compute                      | `ai-interactive` | User-blocking AI (chat, copilot)                   |
|                                  | `ai-background`  | Autonomous/background AI work                      |
| 3 — Slow lane (eventual is fine) | `bulk-ops`       | Mass operations + system cleanup                   |

Add your own queues to `QUEUE_NAMES` as your domains need them — keep the tier discipline (isolate slow/vendor work from user-facing work).

**One dispatcher per queue (NON-NEGOTIABLE).** Each queue has exactly ONE `WorkerHost` — a dispatcher in `apps/backend/src/platform-glue/queue/dispatchers/` extending `BaseQueueDispatcher` (from `@appshore/platform`) that routes by `job.name`. Two `@Processor` classes on one queue compete as consumers and silently drop jobs (`returnvalue: null`). `no-competing-queue-workers.spec.ts` enforces this in CI.

```typescript
// platform-glue/queue/dispatchers/notifications-queue.processor.ts
@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS, { concurrency: 3 })
export class NotificationsQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(NotificationsQueueProcessor.name);
  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.NOTIFICATIONS)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
```

**Job handlers, not processors.** Domain code implements `QueueJobHandler` (from `@appshore/kernel`, `infrastructure/queue/job-handler.contract.ts`) and is provided under `jobHandlersToken(queueName)`:

```typescript
export interface QueueJobHandler {
  readonly jobNames: readonly string[]; // from *_JOB_NAMES constants; dispatcher routes job.name → handler
  handle(job: Job): Promise<unknown>; // throw to trigger BullMQ retry/backoff; return value = job.returnvalue
}
```

Job names live in per-queue `*_JOB_NAMES` constants in `queue.constants.ts` (e.g. `NOTIFICATIONS_JOB_NAMES.DIGEST`). Never add a new `@Processor` class — add a handler and register it under the queue's token.

**Job dispatch:**

```typescript
await this.queue.add(NOTIFICATIONS_JOB_NAMES.DIGEST, payload, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  jobId: bullJobIdFromDbId('notifications', dbJob.id), // see below
});
```

**`jobId` gotcha:** BullMQ rejects pure-integer custom job IDs. Always build IDs via `bullJobIdFromDbId(category, dbId)` from `queue.constants.ts` (produces e.g. `"notifications-48414"`). `bullmq-job-id-conventions.spec.ts` guards this.

**Default job options:** 3 attempts, exponential backoff, remove on complete (24h), remove on fail (7d). Failed-beyond-retry jobs go to `DeadLetterService` (`@appshore/platform`).

**Cron scheduling:** Use `@Cron(CronExpression.EVERY_MINUTE)` for periodic tasks, or register repeatable jobs via `queue.add()` with `repeat` options.

---

## 10. Error Handling

### 10.1 Exception Rules (NON-NEGOTIABLE)

**Always use NestJS exceptions in services and controllers:**

```typescript
throw new NotFoundException('Project not found'); // 404
throw new BadRequestException('Invalid status transition'); // 400
throw new ConflictException('Project number already exists'); // 409
throw new ForbiddenException('Access denied'); // 403
throw new InternalServerErrorException('Service unavailable'); // 500 (rare — infra failures)
```

**NEVER `throw new Error('...')` in service/controller code.** Plain `Error` becomes a 500 with the raw message leaked to the frontend. NestJS exceptions are caught by the global filter (`HttpExceptionFilter`, `@appshore/platform`) and produce clean, user-friendly responses.

**Exception:** Infrastructure-internal code (cache utilities, env validation, health indicators) and queue/workflow workers that never reach HTTP responses may use plain `Error`.

### 10.2 User-Friendly Messages (NON-NEGOTIABLE)

Error messages passed to NestJS exceptions MUST be **user-facing quality**. The `detail` field is shown directly in toast notifications on the frontend.

| DO                                                  | DON'T                                                    |
| --------------------------------------------------- | -------------------------------------------------------- |
| `'This project was not found'`                      | `'Project with ID abc-123 not found in tenant 5'`        |
| `'Invoice number already exists'`                   | `'Unique constraint failed on fields: (invoice_number)'` |
| `'Cannot delete a project with open tasks'`         | `'P2003 foreign key constraint on project_id'`           |
| `'Sync failed. Please reconnect your integration.'` | `'Vendor API error 401: {"error":"invalid_grant"}'`      |
| `'Unable to generate summary. Please try again.'`   | `'No JSON found in agent response'`                      |

**Rules:**

- No database field names, Prisma error codes, or SQL terms
- No internal IDs, tenant IDs, or system identifiers
- No raw external API responses
- No stack traces or code references
- Messages should tell the user WHAT happened and WHAT to do next

### 10.3 External API Errors

When catching errors from external APIs:

```typescript
// CORRECT — log the details, throw a user-friendly message
try {
  const result = await this.vendorClient.syncInvoice(data);
} catch (error) {
  this.logger.error(`Vendor sync failed: ${(error as Error).message}`, (error as Error).stack);
  throw new InternalServerErrorException('Sync failed. Please try again later.');
}

// WRONG — leaking external API internals
throw new Error(`Vendor API error ${res.status}: ${await res.text()}`);
```

### 10.4 Global Filter Response Format

The `HttpExceptionFilter` returns:

```json
{
  "statusCode": 400,
  "timestamp": "2026-07-06T...",
  "path": "/api/v1/...",
  "method": "POST",
  "detail": "User-friendly message",
  "fieldErrors": { "email": "Must be a valid email" },
  "debugDetail": "Technical details..."
}
```

`fieldErrors` is only present on validation errors. `debugDetail` is only included in development.

**Logging:** 5xx → `error` with stack trace. 4xx → `warn`. Silent paths: `/sse/`, `/health/`.

### 10.5 Validation Errors

Validation uses a custom `exceptionFactory` in `main.ts` that produces:

- `detail`: Human-readable summary (e.g., "3 fields have validation errors")
- `fieldErrors`: Map of field name → validation message for frontend inline display

### 10.6 Retry (External API Calls)

`RetryService` from `@appshore/kernel` (`infrastructure/retry/`):

```typescript
await this.retryService.withRetry(
  () => externalApi.call(),
  { maxAttempts: 3, baseDelayMs: 1000 },
  { operation: 'sync-invoice', tenantId },
);
```

---

## 11. AI Invocation Patterns

**Model aliases** (in `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts`):

| Alias      | Use For                                         |
| ---------- | ----------------------------------------------- |
| `fast`     | Chat, classifications, simple extraction        |
| `standard` | Document parsing, structured extraction         |
| `powerful` | Complex extraction, fallback for critical tasks |

Model IDs are HARDCODED in `MODEL_ID_BY_ALIAS` (single source — the cost ledger and provider routes derive from it). A model bump is a one-line change there — never an env var. Env vars hold ROUTES and TIERS, never raw model IDs.

```typescript
import { ai } from '../infrastructure/providers/ai-provider';
const model = ai('standard');
```

**Fallback pattern (document extraction):**

1. Try the `standard` model first
2. On failure, retry with the `powerful` model
3. Return parsing metadata: `{ fallbackUsed, fallbackReason, model, durationMs }`

**Prompt management:** prompts load through `PromptingService` (`apps/backend/src/domains/prompting/`) — Langfuse primary with a code-registered fallback. Register prompts via the domain's registrar; names live in `PROMPT_NAMES` (`prompting.types.ts`).

**Where each AI path is sanctioned:** all conversational/agent AI goes through the Mastra agent runtime (`domains/ai/`). Workflow-shaped exceptions call the AI SDK directly through `StructuredOutputService` (document/structured extraction) and Desk steps via `runStructuredLlmStep()` — orchestrated by **Inngest** (durable workflows), not BullMQ. Don't add new direct-SDK callsites without a documented reason.

**Cost + moderation:** AI calls log to the per-tenant AI spend ledger; user-facing chat goes through moderation. Don't bypass either.

---

## 12. Integration Adapter Pattern

The integration framework lives in `apps/backend/src/domains/integrations/` — the vendor registry (`vendor-registry.ts`, `VENDOR_REGISTRY`) is the extension point.

```typescript
// Interface (vendor-agnostic)
export interface IAccountingAdapter {
  fetchCustomers(token: string, realmId: string): Promise<ExternalCustomer[]>;
  syncInvoice(token: string, realmId: string, payload: InvoiceSyncPayload): Promise<SyncResult>;
}

// Implementation (one per vendor)
@Injectable()
export class AcmeAccountingAdapter implements IAccountingAdapter { ... }

// Usage via service
const { adapter, accessToken, realmId } = await this.getAdapterAndToken(tenantId);
await adapter.syncInvoice(accessToken, realmId, payload);
```

**Token management:** OAuth token refresh is handled by the integrations OAuth infrastructure (`domains/integrations/oauth/`) — expired tokens auto-refresh; never store or refresh tokens ad-hoc in an adapter.

---

## 13. SSE (Backend → Frontend Real-Time)

**Bridge pattern:** Domain events → SSE events → Query invalidation

```
Service emits via DomainEventService → hot bus → DomainEventSseBridge → SseService.emitToTenant()
```

**SseService methods:**

- `emitToTenant(tenantId, eventType, data)` — broadcast to all users in tenant
- `emitToUser(userId, eventType, data)` — unicast to specific user

**When adding SSE for a new domain:** update the 5 files listed in §8 (Domain Events).

---

## 14. Auth & Guards

**Global guard chain (AppModule, order matters):**

1. `ThrottlerGuard` — rate limiting
2. `JwtAuthGuard` — JWT validation
3. `TenantGuard` — tenant context resolution (short-circuits to the implicit tenant when `MULTI_TENANT=false`)
4. `RolesGuard` — role-based access
5. `PlanGuard` — subscription tier checks

Guards and decorators live in `@appshore/platform` (`auth/guards/`, `auth/decorators/`).

**Decorators:**

- `@Roles(UserRole.ADMIN, ...)` — required roles
- `@RequireFeature('key')` — feature flag check
- `@CurrentUser()` — extract user from JWT
- `@TenantDbId()` — extract numeric tenant DB id from request
- `@Public()` — skip auth guards (webhooks, health)
- `@SkipThrottle()` — exempt from rate limiting (health endpoints only)

**NEVER** add `@UseGuards(ThrottlerGuard)` — it's already global.

**Tenancy modes:** the same code runs multi-tenant, single-tenant, and personal via `TENANCY_MODE` / `MULTI_TENANT`. Never branch on the mode in domain code — tenant scoping (`where: { tenantId }`) works identically in all modes because the guard chain resolves the tenant either way.

---

## 15. Observability & Tracing

**OpenTelemetry** (`@appshore/kernel`, `infrastructure/telemetry/`):

- NodeSDK with OTLP HTTP exporter (Tempo/Grafana target)
- HTTP instrumentation (automatic span capture)
- Graceful flush on SIGTERM
- LLM observability: Langfuse (separate pipeline)

**Request context** (`@appshore/kernel`, `infrastructure/logging/request-context.middleware.ts`):

- AsyncLocalStorage propagates `{ requestId, tenantId, userId }` across async boundaries
- UUID validation on incoming `x-request-id` (prevents log injection — a non-UUID header is dropped and replaced)
- The middleware echoes the requestId back in the response header so clients can correlate logs.
- Guards enrich context post-auth — by the time the controller runs, `tenantId` and `userId` are in scope.
- Pino logger auto-injects context into all log lines.
- **Crossing the queue boundary:** the request handler MUST forward the requestId into the BullMQ job payload (e.g. `{ ..., correlationId: requestContextStorage.getStore()?.requestId }`). The processor reads it and patches its own log context so worker logs share the request's correlation chain. Without this, logs from queue work look like an orphan island.

**Don't** put requestId, tenantId, or internal IDs in user-facing exception messages. They belong in logs (where context already injects them), not in the toast the user sees.

**Pino logging:** pretty-printing in dev, JSON in production. Redaction: authorization, cookies, passwords, tokens, emails, phones, keys, secrets. Silent paths in dev: `/sse/`, `/health/`.

---

## 16. Notifications

**Multi-channel dispatcher** (`apps/backend/src/domains/notifications/` + `@appshore/platform` `infrastructure/notification/`):

- Channels: in-app / EMAIL (provider primary, SMTP fallback, console in dev) / push / SMS
- DB-tracked: PENDING → SENT/FAILED with notification history
- Push: Web Push API with VAPID keys, multi-subscription per user, auto-cleanup of expired subscriptions (410/404)

**Notification triggers (non-blocking pattern):**

```typescript
this.notificationTriggers
  .invoiceReady(tenantId, invoice)
  .catch((err) => this.logger.warn(`notify failed: ${err.message}`)); // never block the main flow
```

**Pick the right messaging layer:** an _event addressed to a person_ is a notification (bell/inbox). A _persistent tenant-wide truth_ (trial expiring, setup incomplete, platform broadcast) should be modeled as a standing condition/announcement surfaced by the platform — not a bespoke one-off banner. Platform-wide messages flow through the announcements domain (`@appshore/platform`, `domains/announcements/`).

---

## 16.1 File Streaming & Generated Documents (PDF, CSV)

For endpoints that return generated binaries (reports, invoices, exports), don't return JSON wrapping a base64 blob. Stream directly:

```typescript
@Get(':project_id/report')
async report(
  @Param('project_id') projectId: string,
  @CurrentUser() user: any,
  @Res({ passthrough: false }) res: Response,
) {
  const tenantDbId = await this.getTenantDbId(user);
  const data = await this.projectsService.getReportData(projectId, tenantDbId);
  const pdf = await this.reportPdfService.generate(data);   // Buffer
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-${projectId}.pdf"`);
  res.setHeader('Content-Length', String(pdf.length));
  res.end(pdf);
}
```

**Rules:**

- `@Res({ passthrough: false })` — you're handling the response yourself; NestJS shouldn't add JSON.
- Always set `Content-Length`, `Content-Disposition`, and `Content-Type`. Filename must not include user-supplied strings without sanitization.
- For very large outputs (multi-MB exports), stream chunks instead of building a full Buffer in memory.
- The auth/role check still runs first — you don't get to skip `@Roles` because the response is binary.

---

## 16.2 Graceful Shutdown

`main.ts` enables shutdown hooks (`app.enableShutdownHooks()`). On SIGTERM, the order is:

1. Stop accepting new connections (NestJS does this when `app.close()` is called).
2. Drain in-flight HTTP requests (`app.close()` waits for handlers to complete).
3. Drain BullMQ workers (configure `concurrency` and graceful shutdown timeouts per dispatcher).
4. Flush OTel spans.
5. Close Prisma + Redis connections via NestJS `OnModuleDestroy` hooks.

Don't `process.exit()` in shutdown paths — it kills the process before flush. Throw or rely on the framework's lifecycle.

---

## 17. Webhooks

**Inbound:**

- HMAC-SHA256 signature verification with `crypto.timingSafeEqual()`
- Raw body access via `req.rawBody` (configured in main.ts)
- `@Public()` decorator (no auth required)
- `@HttpCode(200)` — always return 200 to prevent vendor retries

**Outbound** (`apps/backend/src/platform-glue/webhooks/`):

- Subscription-based: tenants register webhook URLs + event patterns
- BullMQ queue delivery (the `webhooks` queue)
- HMAC-SHA256 signed payloads
- 3 attempts with exponential backoff
- Wildcard event matching (e.g., `app.project.*`)
- Only `visibility: 'external'` registry events appear in the subscription catalog

---

## 18. Health Checks

```typescript
@Controller('health')
@Public()
@SkipThrottle()
// GET /health/live   — liveness (simple "up")
// GET /health/ready  — readiness (Postgres + Redis ping)
// Uses @nestjs/terminus HealthCheckService (wired in @appshore/platform health/)
```

---

## 19. Validation Pipe (Global)

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Reject unknown properties with 400
    transform: true, // Auto-transform to DTO class instances
  }),
);
```

---

## 20. No Magic Strings (NON-NEGOTIABLE)

**NEVER inline string literals that represent domain concepts, statuses, event names, feature keys, queue names, cache keys, or any repeated value.** Always import from a shared constant, enum, or schema.

**Hierarchy (prefer top to bottom):**

1. **Prisma enum** — `UserRole.ADMIN`, `TaskStatus.DONE` (from `@appshore/db`)
2. **Shared-types generated enum** — from `@app/shared-types`
3. **Constants file** — `DOMAIN_EVENTS.PROJECT_CREATED`, `QUEUE_NAMES.NOTIFICATIONS`, `CACHE_TTL_WARM_5M`
4. **Module-level `const`** — if truly local to one file and not reusable, define a named constant at the top of the file

**Common violations to catch:**

| BAD (magic string)                                | GOOD (named constant)                                  |
| ------------------------------------------------- | ------------------------------------------------------ |
| `where: { status: 'ACTIVE' }`                     | `where: { status: ProjectStatus.ACTIVE }`              |
| `@Roles('ADMIN', 'OWNER')`                        | `@Roles(UserRole.ADMIN, UserRole.OWNER)`               |
| `this.events.emit('app.project.created', ...)`    | `this.events.emit(DOMAIN_EVENTS.PROJECT_CREATED, ...)` |
| `this.queue.add('send-digest', ...)`              | `this.queue.add(NOTIFICATIONS_JOB_NAMES.DIGEST, ...)`  |
| `if (user.role === 'SUPER_ADMIN')`                | `if (user.role === UserRole.SUPER_ADMIN)`              |
| `throw new BadRequestException('invalid status')` | OK — error messages are prose, not domain tokens       |

**Rule of thumb:** If a string appears in a `where` clause, comparison, event name, queue name, role check, status check, or feature flag — it MUST come from a constant or enum, never be typed inline.

**Exception:** Prisma `orderBy` values (`'asc'`, `'desc'`) and HTTP methods (`'POST'`, `'PATCH'`) are acceptable inline — they're framework primitives, not domain concepts.

---

## 20a. Status Casing (NON-NEGOTIABLE)

All `status` columns and status enums use **UPPER_SNAKE_CASE** end-to-end: Prisma enum → generated shared-types mirror → backend service → DTO `@IsIn` → frontend comparator.

**DTO contract:** reference the generated schema's `.options` instead of duplicating the array:

```ts
import { TaskStatusSchema, type TaskStatus, type UpdateTaskStatusInput } from '@app/shared-types';

const TASK_STATUSES = TaskStatusSchema.options;

export class UpdateTaskStatusDto implements UpdateTaskStatusInput {
  @ApiProperty({ enum: TASK_STATUSES, description: 'Target status for the task' })
  @IsString()
  @IsIn(TASK_STATUSES)
  status: TaskStatus;
}
```

**Anti-pattern:** hardcoding the array in a DTO instead of `Schema.options`:

```ts
// BAD — duplicates the enum, drift hides at compile time
const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'] as const;

// GOOD — single source of truth, DTO follows the schema automatically
const TASK_STATUSES = TaskStatusSchema.options;
```

Guardrails: `schema-conventions.spec.ts`, `web-status-casing.spec.ts`, `status-call-sites.spec.ts` (all in `apps/backend/src/architecture/`). Derived lowercase UI labels (synthesized summaries for display, not DB columns) and third-party wire formats are the only sanctioned exceptions — allow-list them explicitly.

---

## 21. Anti-Patterns (NEVER Do These)

**Error handling:**

- NEVER `throw new Error('...')` in services — always use NestJS exceptions
- NEVER `console.log` / `console.error` — always use `private readonly logger = new Logger(ClassName.name)`
- NEVER let Prisma errors bubble unhandled — the global filter maps P2002/P2025/P2003/P2014, but services should still catch domain-specific cases
- NEVER pass raw external API error messages to NestJS exceptions — log the details, throw a user-friendly message (§10.3)
- NEVER include database field names, internal IDs, or Prisma error codes in exception messages — these leak to the frontend toast (§10.2)
- NEVER `throw new InternalServerErrorException(error.message)` for caught external errors — the message may contain API keys, tokens, or internal details

**Data integrity:**

- NEVER create parent + children as separate operations — wrap in `this.prisma.$transaction()`
- NEVER check-then-create without atomicity — use `prisma.model.upsert()` instead of `findUnique → if null → create`
- NEVER accept unbounded pagination — always use `clampPagination()` from `@appshore/kernel`
- Financial operations (payments, invoices) MUST check for duplicates before creating

**Correlation:**

- Always pass `correlationId` from request context when dispatching queue jobs
- Import `requestContextStorage` from the kernel logging middleware to extract the requestId

**Configuration:**

- Use `ConfigService` for env var access in domain services
- Direct `process.env` is acceptable ONLY in: `main.ts`, configuration files, telemetry bootstrap, and pre-bootstrap files

**Soft deletes:**

- Prefer `deletedAt DateTime?` for new entities (with `deletedBy` tracking)
- `isActive` booleans are legacy — do not add more
- Always filter by `deletedAt: null` (or the legacy `isActive: true`) in queries

---

## 22. Infrastructure Checklist (New Feature)

- [ ] Prisma model in `app.prisma` + migration + `pnpm prisma:generate`
- [ ] Shared types (Zod schemas) exported from `@app/shared-types` index; package rebuilt
- [ ] Module registered in parent domain module (imports + exports)
- [ ] Controller: `@Roles`, `@ApiOperation`, `@ApiBearerAuth` on every endpoint
- [ ] Service: all queries scoped by tenantId, Logger, standard exceptions
- [ ] DTOs: `implements` shared-type interface, class-validator + Swagger decorators, camelCase
- [ ] Cache: use TTL tiers, add invalidation rules if needed
- [ ] Events: add to `APP_EVENT_REGISTRY` if state changes matter
- [ ] SSE bridge: map domain event → SSE event → frontend query keys
- [ ] Queue: if async processing needed, add a `QueueJobHandler` + job name constants (never a new `@Processor`)
- [ ] Error messages: user-friendly, no internal details (§10.2)
- [ ] External API errors: logged with details, thrown with generic message (§10.3)
- [ ] No magic strings: all statuses, roles, events, queues use enums/constants (§20)
- [ ] MCP tools: if the entity has AI-facing operations, add/update tools in `domains/ai/mcp/tools/` (§23)
- [ ] Domain events: emit via `DomainEventService.emit()` (hot + durable paths), NOT raw `EventEmitter2` (§8.1)
- [ ] State machine: status transitions go through a dedicated method that whitelists allowed `from → to` (§3.1)
- [ ] Multi-tenant isolation: every query filters by `tenantId`; record-level checks for owned resources (§2.1)
- [ ] Feature flags: `@RequireFeature` at controller, after `@Roles` (§2.2)
- [ ] Pagination: pass through `clampPagination()` before hitting the DB
- [ ] Correlation: queue jobs include `correlationId` from request context (§15)
- [ ] Transactions: parent + children atomic; FK-safe delete order; no external API calls inside `$transaction` (§6.2)
- [ ] Terraform: if new env vars, add to `infra/terraform/`
- [ ] Tests: co-located `*.spec.ts`, ≥90% on changed files, fixtures from `@appshore/platform/test/*`

---

## 23. MCP Tools — Keeping AI in Sync with the API (NON-NEGOTIABLE)

**Rule:** When you add, modify, or remove a backend API endpoint for an entity the AI assistant can operate on, you MUST verify that the corresponding MCP tools in `apps/backend/src/domains/ai/mcp/tools/` are still accurate and up-to-date.

**Why:** the AI assistant uses MCP tools to interact with your data. If the API changes but MCP tools don't, the AI gives wrong answers or fails silently. This is a production-facing reliability issue.

**MCP tool structure** (one query tool + one action tool per entity family):

```
domains/ai/mcp/tools/<domain>/
  project-query.tool.ts       # Read-only: list, get, search
  project-action.tool.ts      # Mutations: create, update, status changes
```

**When to update:**

- New entity field → add to the query tool's response mapping and parameter schema if filterable
- New entity status → add to the query tool's status enum parameter
- New operation (e.g., new POST endpoint) → add to the action tool
- Removed field/endpoint → remove from MCP tools
- Changed response shape → update tool response formatting

**Registration:** tools are provided in `mcp-tools.module.ts` (the empty toolset is your extension point). New tools must be:

1. Created in the appropriate `tools/{domain}/` directory
2. Registered in `mcp-tools.module.ts` providers array
3. Module import added if the tool depends on a domain service (use `forwardRef(() => Module)` if needed)

**Tool patterns:**

- `_tenantId` parameter is system-injected, never from AI input
- All queries filter by `tenantId` (+ lifecycle status where applicable)
- Query tools return structured data
- Action tools resolve entities by public business ID (`projectNumber`) before calling services
- Error handling: catch exceptions and return `{ error: 'user-friendly message' }` instead of throwing

---

## 24. Desk — Durable AI Workflow Engine (summary)

The Desk domain (`apps/backend/src/domains/desk/`) is an Inngest-orchestrated engine for autonomous AI "responsibilities" with human-in-the-loop approval. The responsibility registry ships **empty** — it's an extension point.

> Vocabulary (NON-NEGOTIABLE): **responsibility / episode / step** — a responsibility is an autonomous duty; an episode is one run against one entity; a step is a discrete durable operation. `COMING_SOON` is a real definition with `lifecycle: 'COMING_SOON'`, not stubbed code.

Key rules (full authoring guide: the **`desk-patterns`** skill):

- Steps run in Inngest workers, not HTTP — **throw plain `Error`**, not NestJS exceptions.
- The gate algorithm (`core/gate/gate.algorithm.ts`) is pure and job-blind — per-responsibility conditions ride in via the definition's `conditionsEvaluator`.
- Trust thresholds are single-source in shared-types (`TRUST_LEVEL_CONFIDENCE_THRESHOLDS`) — never inline.
- Responsibilities call existing domain services via MCP tools in the execute step. Never duplicate business logic.
- Use `DESK_OUTCOMES` constants (`shared-steps/outcomes.ts`), never bare outcome strings.
- LLM steps go through `runStructuredLlmStep()` (`shared-steps/_llm-step.helper.ts`) — prompt via PromptingService, Zod-validated output, cost-ledger logging.
