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
- Domain events need no import: `EventBusModule` is global and provides `OutboxService` (§8.1)
- Add QueueModule if using BullMQ queues

---

## 2. Controller Patterns

```typescript
const PROJECT_ID_PARAM = { name: 'project_id', description: 'Project public id (prj_…)' } as const;

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
  @ApiResult(ProjectListResponse)
  async list(@CurrentUser() user: any, @Query() query: ProjectListQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.projectsService.findAll(tenantDbId, { status: query.status });
  }

  @Get(':project_id')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiParam(PROJECT_ID_PARAM)
  @ApiResult(ProjectResponse)
  async getOne(@Param('project_id') projectId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.projectsService.findOne(projectId, tenantDbId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create project' })
  @ApiResult(ProjectResponse, HttpStatus.CREATED)
  async create(@CurrentUser() user: any, @Body() dto: CreateProjectDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.projectsService.create(tenantDbId, dto);
  }

  @Post(':project_id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Archive a project' })
  @ApiParam(PROJECT_ID_PARAM)
  @ApiResult(ProjectResponse)
  async archive(@Param('project_id') projectId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.projectsService.archive(projectId, tenantDbId); // the project as it is now
  }

  @Delete(':project_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete a project' })
  @ApiParam(PROJECT_ID_PARAM)
  @ApiNoContentResponse({ description: 'Deleted' })
  async remove(@Param('project_id') projectId: string, @CurrentUser() user: any): Promise<void> {
    const tenantDbId = await this.getTenantDbId(user);
    await this.projectsService.remove(projectId, tenantDbId);
  }
}
```

**Decorator checklist (every endpoint):**

- `@Roles(...)` — RBAC (use the `UserRole` enum from `@appshore/db`: `OWNER`, `ADMIN`, `MEMBER`, `SUPER_ADMIN`)
- `@HttpCode(...)` — on every POST and every DELETE (section 2.3)
- `@ApiOperation({ summary: '...' })`: what the route does, in one line (section 2.4)
- `@ApiParam({ name, description })`: on any `:param` endpoint, with a description
- `@ApiResult(<response schema>, <status>)` or `@ApiNoContentResponse()`: the success body (section 2.4)
- `@RequireFeature('feature_key')` — if behind a feature flag

**`BaseTenantController` utilities** (`@appshore/platform`, `shared/base/base-tenant.controller.ts`):

- `getTenantDbId(user)` — resolves JWT tenant string to DB numeric ID
- `getUserDbId(userId)` — resolves JWT user string to DB numeric ID
- `validateTenantAccess(resourceTenantId, userTenantId)` — cross-tenant check (throws 404, see section 2.3)

**URL param naming:** snake_case in URL (`:project_id`), camelCase in the TS variable. One name per collection:
every route that addresses a project calls the param `:project_id`. `@Param('project_id')` must match the placeholder.

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

### 2.3 Status by Route Shape (NON-NEGOTIABLE)

The success status says what happened. It follows the shape of the route (ADR "API contract", section 1).

| Route                                                 | Status | Body                               | Decorator                          |
| ----------------------------------------------------- | ------ | ---------------------------------- | ---------------------------------- |
| `POST /things` (a new addressable record exists)      | 201    | the created resource               | `@HttpCode(HttpStatus.CREATED)`    |
| `POST /things/:thing_id/verb` (an action on a record) | 200    | the resource as it is now          | `@HttpCode(HttpStatus.OK)`         |
| Work was queued                                       | 202    | the record to poll (job, delivery) | `@HttpCode(HttpStatus.ACCEPTED)`   |
| `DELETE`                                              | 204    | none: the handler returns `void`   | `@HttpCode(HttpStatus.NO_CONTENT)` |
| A POST with nothing to return (logout, send a code)   | 204    | none                               | `@HttpCode(HttpStatus.NO_CONTENT)` |
| GET, PATCH, PUT                                       | 200    | the resource                       | none needed                        |

Rules:

- **Every POST declares its status.** Nest answers 201 to any POST unless told otherwise, so a missing `@HttpCode`
  is a wrong status waiting to happen.
- **No acknowledgement bodies.** Never `return { success: true }`, `{ message: 'Done' }`, `{ deleted: true }`. Return
  the resource as it is now, or answer 204. The web client and the mobile client both read a 204 and an empty 2xx
  body as "no value".
- **An action verb is the last segment after a param** (`/invitations/:invitation_id/resend`). It is never 201. The
  verbs the ratchet knows are in `ACTION_VERBS` in `api-contract.spec.ts`; add yours there.
- **An illegal state transition is 409**: `throw invalidState('Only failed jobs can be retried')`, never a 400 or a 403. A 400 is for a field of the request that is wrong.
- **Another tenant's record is 404**, with the same text as a missing one. A 403 or a 400 confirms that it exists.
  Scope the read itself (`findFirst({ where: { id, tenantId } })`); the ratchet flags a tenant comparison answered
  with either status, whatever the message.

**Provider routes.** A route whose wire format a third party sets (a vendor webhook, the MCP transport, OAuth
protocol routes, a vendor's OAuth redirect, an SSE stream) keeps the format the standard or vendor document fixes.
List it in `PROVIDER_ROUTES` in `apps/backend/src/architecture/api-contract.allowlist.json`, with the document as
the reason. An entry exempts the route from four rules only: acknowledgement bodies, query DTOs, snake_case query
keys, and "a 400 names its field". It still declares its status, and it is either documented (`@ApiOperation`) or
excluded on purpose (`@ApiExcludeEndpoint()`).

**Edge.** `@SkipThrottle()` is for health and SSE routes only. A signed webhook, an MCP route or a dev lever gets
`@Throttle(GENEROUS_THROTTLE)` (`@appshore/platform/shared/http/edge-throttle`): a ceiling, not an exemption. Never
put `@SkipThrottle()` beside a `@Throttle(...)`: the skip wins and the limit is off. A route that takes an API key
or an OAuth token (`ApiKeyAuthGuard`, `OAuthTokenGuard`) also carries `AgentRateLimitGuard` and sits on a controller
with `@UseFilters(BearerChallengeFilter)`, so a 401 tells the client where to authenticate.

**The ratchet.** `apps/backend/src/architecture/api-contract.spec.ts` holds these rules (`status/*`, `naming/*`,
`edge/*`, `input/*`, `errors/*`, `output/*`, `docs/*`) and runs on every push. The starter's own routes pass all of
them: `api-contract.baseline.json` ships as `{}`, and a test holds it empty, so any violation is new and fails. Fix
the route; never add a baseline entry. (A product that adopts a rule before its code follows it removes the
empty-baseline test in a reviewed diff; its baseline then only shrinks, through `UPDATE_API_BASELINE=1 pnpm --filter
@app/backend exec jest src/architecture/api-contract`.) Run `pnpm verify:api` before a pull request that changes the
wire: it boots the backend and runs the Playwright `api` project against it, the contract spec included.

### 2.4 The Published Contract: OpenAPI (NON-NEGOTIABLE)

The OpenAPI document is generated from the code, committed, and held to it (ADR "API contract", section 4). A
contract change is a reviewed diff of `apps/backend/openapi.json`.

- **One builder.** `apps/backend/src/bootstrap/openapi.ts` builds the document the API serves at
  `/api/openapi.json` and the one `pnpm --filter @app/backend openapi:generate` writes. The generator boots the module
  graph in Nest's preview mode (no port, no database, no Redis), pins the environment and sorts keys, so the file
  changes only when the contract does. After any change to a route, a DTO or a response schema, run it and commit both
  files (`openapi.json`, `public-openapi.json`).
- **It refuses an incomplete document.** Every operation needs a summary (`@ApiOperation`), a described path param
  (`@ApiParam({ name, description })`), body properties (`@ApiProperty` / `@ApiPropertyOptional` on each DTO field;
  `PartialType` from `@nestjs/swagger`, not `@nestjs/mapped-types`), and exactly one success response at the status
  the route answers. A route that writes its own response (`@Res()`) or is `@Public()` may skip the response schema.
- **Response schemas are the `@app/shared-types` Zod schemas**, named once in an `openapi.responses.ts` beside the
  controller group and referenced by name:

  ```typescript
  // openapi.responses.ts
  export const ProjectResponse = defineResponseSchema('Project', ProjectSchema);
  export const ProjectListResponse = defineCursorListSchema('ProjectList', ProjectListItemSchema);

  // controller
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiResult(ProjectResponse, HttpStatus.CREATED)
  ```

  `ApiResult` and `defineResponseSchema` come from `@appshore/platform/shared/openapi/api-result`,
  `defineCursorListSchema` from `common-responses`. The schema describes what the route really sends: dates as ISO
  strings, nullable columns `.nullable()`, a numeric id only where `id-boundary.allowlist.json` lists it. A bare array
  (`@ApiResult([X])`) is only for a reasoned `BOUNDED_LISTS` entry; every other list is a cursor list. Where no Zod
  schema exists, a response class with `@ApiProperty` on each field works too.

- **Errors are documented for you.** The builder puts the error envelope on every operation (`default`, and any 4xx
  a route names); the OAuth protocol routes get RFC 6749's `{ error, error_description }` instead.
- **What is served.** In production (`isProductionEnv()`, so every deployed task of the shipped image, staging
  included) `/api/openapi.json` serves the public subset; a local run serves the full document. Never read
  `NODE_ENV` or `ENV_TYPE` for this: call `isProductionEnv()`.
- **The public subset is derived, never listed.** `apps/backend/src/bootstrap/public-openapi.ts` publishes a route
  when it is `@Public()` and takes an outside credential (`ApiKeyAuthGuard`, `OAuthTokenGuard`), is metered as an
  agent (`AgentRateLimitGuard`), or speaks an agent protocol (`BearerChallengeFilter`, `OAuthErrorFilter`). To open a
  route to API keys, put those guards and the filter on it; it is published on the next generate. A new credential
  guard goes in `AGENT_AUTH_GUARDS` (with its scheme) or `NON_CREDENTIAL_GUARDS` (with the reason it is not one): the
  generator stops on a guard it cannot classify, and on a credential route without the bearer challenge.
- **A QA or dev lever is not part of the contract**: `@ApiExcludeController()`.
- **Retiring a v1 route.** A breaking change ships as v2 beside v1; mark the v1 route
  `@DeprecatedRoute({ since, sunset, successor? })` (`@appshore/platform/shared/http/deprecation`). It writes
  `Deprecation`, `Sunset` and `Link` on every response and marks the operation deprecated in the document. A sunset
  less than 182 days after `since` throws at boot.

Held by `apps/backend/src/architecture/swagger-completeness.spec.ts` (runs the generator; fails on an incomplete
document, an unclassified route, or drift from the committed files, and names the regenerate command), the ratchet
rules `docs/api-operation` and `docs/response-documented`, and `tests/api/contract/openapi.spec.ts` under
`pnpm verify:api` (the served document equals the committed one, and every parameterless GET body matches its
published schema).

### 2.5 Creates Are Retry-Safe: Idempotency-Key (NON-NEGOTIABLE)

A create accepts an optional `Idempotency-Key` (ADR "API contract", section 5). You write nothing for it: the global
`IdempotencyInterceptor` (`@appshore/platform/infrastructure/idempotency`) covers every authenticated POST whose
`@HttpCode` is 201 or 202, and the OpenAPI builder documents the header on exactly those operations.

- **What it does.** Scope is tenant and user. The same key and request within 24 hours replays the first status and
  body with `Idempotent-Replayed: true`; the same key on another route or body is 409 `IDEMPOTENCY_KEY_REUSED`; a
  retry while the first runs is 409 `IDEMPOTENCY_KEY_IN_USE`. Only a success is remembered. It fails open: if Redis
  does not answer in 2 seconds the request runs without the key.
- **Not covered:** no tenant on the request (sign-up, super admin), `@Public()`, multipart uploads, a route with
  `@Res()` (not `passthrough`), and anything that is not 201 or 202. An action POST (`/:id/verb`, 200) is not covered:
  make the action itself idempotent (a state check, an upsert) instead.
- **`@SkipIdempotency()` on every create whose body shows a secret once**: a plaintext API key, a client or signing
  secret, a token or a token-bearing link. A replay would store that secret in Redis for 24 hours. The starter marks
  `POST /api-keys`, `POST /oauth/clients`, `POST /webhooks` and `POST /invitations`.
- **A body over 256 KB is not remembered.** A create answers the record, not a document.
- **Agent tools** take the same store with a `tool:<name>` target (`IdempotencyStore.claim`); the MCP argument is not
  wired yet.

Held by `packages/appshore/platform/src/infrastructure/idempotency/idempotency.spec.ts` (the mechanism),
`apps/backend/src/bootstrap/__tests__/openapi.spec.ts` (the header on exactly the covered creates),
`swagger-completeness.spec.ts` (a response that carries a secret field is never replayable: mark the route
`@SkipIdempotency()`), and `tests/api/idempotency.spec.ts` under `pnpm verify:api`.

---

## 3. Service Patterns

```typescript
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly outbox: OutboxService, // `@appshore/platform/infrastructure/events/outbox.service`
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
    // The row and its event commit together; the event is published after the commit (§8.1).
    return this.outbox.transaction(async (tx, emit) => {
      const project = await tx.project.create({
        data: { ...data, tenantId },
      });
      await emit(DOMAIN_EVENTS.PROJECT_CREATED, tenantId, { projectNumber: project.projectNumber }, actor);
      return project;
    });
  }
}
```

**Rules:**

- EVERY query MUST scope by `tenantId`
- Use `Logger` with class name: `new Logger(ClassName.name)`
- Throw standard NestJS exceptions: `NotFoundException`, `BadRequestException`, `ConflictException`, `ForbiddenException`
- State machine transitions: validate current status before updating (see §3.1)
- Raise a domain event inside `OutboxService.transaction((tx, emit) => …)`, with the write it describes — never
  `DomainEventService.emit` after the commit, never raw `EventEmitter2.emit` (see §8.1)
- A list that can grow is a cursor list: `clampCursorLimit`, `keysetWhere`, `buildCursorPage` from `@appshore/kernel/shared/utils/cursor-pagination` (see §3.3). There is no offset or page paging

### 3.1 State Machine Transitions

Status changes are not free-form updates. Every status transition belongs in a dedicated method (or sub-service like `TaskStatusService`) that whitelists the allowed `from → to` set.

```typescript
async updateStatus(taskId: number, tenantId: number, next: TaskStatus, actor: EventActor) {
  const task = await this.findOne(taskId, tenantId);
  this.assertTransition(task.status, next);   // throws 409 INVALID_STATE on an illegal transition
  return this.outbox.transaction(async (tx, emit) => {
    const updated = await tx.task.update({ where: { id: task.id }, data: { status: next } });
    await emit(DOMAIN_EVENTS.TASK_STATUS_CHANGED, tenantId, { taskId, from: task.status, to: next }, actor);
    return updated;
  });
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
    // 409, not 400: no field of the request is wrong, the record's state does not allow it. `stateLabel` keeps
    // the raw enum name out of the copy.
    throw invalidState(`A task that is ${stateLabel(from)} cannot become ${stateLabel(to)}`);
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

- A domain event is not a side effect to fire and forget: it is staged in the write's transaction (§8.1), and
  publishing it never fails the caller.
- For separate DB writes that aren't part of the main transaction (audit log entries, log tables), wrap in `.catch()` with a logger warn so a failure doesn't 500 the response.
- Don't `.catch(() => {})` silently — log at minimum. Silent swallow turns a known failure into a mystery.
- If the side effect MUST succeed (charge customer, persist invoice), it's not a side effect — it's part of the main flow. Put it in the transaction or fail the request.

### 3.3 Lists Are Cursor Lists (NON-NEGOTIABLE)

Every list that can grow answers one envelope, `CursorList<T>` from `@app/shared-types`:
`{ items, nextCursor, total, counts? }`. Page size is 50 by default and 100 at most. The cursor is opaque. There is
no offset, no page number, and no second envelope (`{ data, total }`, `{ rows, nextCursor }`).

```typescript
// The shape of InvoiceService.listInvoices (apps/backend/src/domains/billing/services/invoice.service.ts)
import { buildCursorPage, clampCursorLimit, encodeCursor, keysetWhere } from '@appshore/kernel/shared/utils/cursor-pagination';

// BillingInvoice.id is a cuid String, so it is public and can be the tiebreak. A table keyed by an Int uses publicId.
const INVOICE_KEYSET = { field: 'createdAt', idField: 'id', kind: 'date', direction: 'desc' } as const;

async listInvoices(tenantId: number, query: InvoiceListQuery = {}): Promise<CursorList<BillingInvoice>> {
  const take = clampCursorLimit(query.limit);
  // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
  const keyset = query.cursor ? keysetWhere({ ...INVOICE_KEYSET, cursor: query.cursor }) : undefined;
  const scope: Prisma.BillingInvoiceWhereInput = { tenantId };
  if (query.status) scope.status = query.status;

  const [rows, total] = await Promise.all([
    this.prisma.billingInvoice.findMany({
      where: keyset ? { AND: [scope, keyset] } : scope,   // AND, never spread: a search's OR must survive
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,                                      // the probe row says whether a next page exists
    }),
    this.prisma.billingInvoice.count({ where: scope }),     // the total ignores the cursor
  ]);
  return { ...buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.id)), total };
}
```

**Rules:**

- The query DTO extends `CursorQueryDto` (`limit`, `cursor`), `ListQueryDto` (+ `q`) or `DatedListQueryDto`. The
  controller passes the DTO to the service; the service clamps the limit and decodes the cursor.
- **Order by the sort column, then a unique tiebreak in the same direction.** A date column needs
  `kind: 'date'`: the database keeps microseconds and the cursor milliseconds, so the helper treats the cursor's
  millisecond as a bucket. A name is `kind: 'text'`; a number or key is `kind: 'value'`.
- **The tiebreak is a public identifier, never an Int primary key**: the table's string id (`userId`,
  `tenantId`, `invitationId`, a UUIDv7 row id), its human number (`ticketNumber`), or a `publicId` (§3.4). A
  cursor is opaque but not encrypted. The one exception is the two API key lists: the table has no public id and
  a key is addressed by its numeric id, so the cursor carries nothing the URL does not show (ADR "ID boundary").
- Join the scope and the keyset with `AND: [scope, keyset]`. Never spread both into one object: each may carry an
  `OR`, and the second replaces the first.
- `total` counts the current view (search, filters, dates, status) and never the cursor. `counts` is for a status
  pivot: per-status totals for the same filters with the status filter left out (`pivotCounts`).
- A sort over a SQL aggregate (spend per tenant) spells the keyset out in SQL and tags the cursor with whatever
  the totals depend on (the window's first day), so a cursor from another window is a 400, not a wrong page.
  See `AdminAiSpendService.listTenants`.
- **A picker is a cursor list with `q`**: the first page until the user types, then a server search. See
  `listTenantOptions` (`apps/backend/src/shared/lists/tenant-options.ts`).
- **A list that does not grow may stay a bare array**, as an entry in `BOUNDED_LISTS` of
  `apps/backend/src/architecture/api-contract.allowlist.json`, with the reason its size is fixed (one row per
  enum value, per registry entry, per unique key) or the named `take` that caps it.
- **Every other read a GET reaches is bounded.** A `findMany` has a `take` with a named maximum
  (`PAYMENT_METHOD_LIST_CAP`), or the method is an entry in `BOUNDED_READS` with the unique key or registry
  that fixes its size. Never load rows to count or sum them: `count`, `groupBy`, or one SQL aggregate.
- **An index backs the keyset**: the list's scope columns, then its sort column, then the tiebreak
  (`@@index([tenantId, createdAt, publicId])`). Add one only where no existing index already starts with the
  scope columns followed by the sort column. In the migration: `CREATE INDEX IF NOT EXISTS`.
- **Test by walking real pages.** `fixtureModel(rows)`, `tiedTimestamps(n)` and `walkCursorList(read)` from
  `@appshore/platform/test/helpers/cursor-walk` run the service over a fixture through `prisma-where`: assert
  every row comes back once across pages, rows that share a timestamp included, that the total holds on every
  page, and that a cursor the service did not issue is a 400 before any query runs.
- Held by the ratchet rules `output/lists-are-cursor-lists`, `output/list-reads-are-bounded` and
  `output/no-raw-prisma-from-controllers` in `api-contract.spec.ts`. The starter's routes pass all three: the
  baseline holds no entry for them.

### 3.4 The ID Boundary (NON-NEGOTIABLE)

An Int primary key never crosses the API. The canonical text is [`id-convention.md`](./id-convention.md) (role 6
and "The boundary"); the decision record is the ADR "ID boundary".

- **Resolve on the way in.** `@Param('id', ParseUUIDPipe) publicId: string`, then the service resolves it
  (`findUnique({ where: { publicId } })`) and answers 404 when it is unknown. Never `ParseIntPipe` on a route
  param, and no DTO property named `id` / `*Id` typed `number`.
- **Serialize on the way out.** A `toPublic…(row)` function beside the service emits the public id and omits
  `id` and every numeric foreign key. See `broadcast.serializer.ts`, `invitation.serializer.ts`,
  `feedback.serializer.ts`, `notification.serializer.ts`.
- **Public ids in event payloads.**
- A new aggregate takes `generateId(prefix)` in a `VarChar(30)`. An existing table that needs an address takes
  `public_id UUID` with the five-step migration in `id-convention.md`.
- Held by `apps/backend/src/architecture/id-boundary.spec.ts`. The numeric ids that exist today are listed in
  `id-boundary.allowlist.json` with a reason each; the list may only shrink.

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

### 4.1 Query DTOs — a query string is a class, like a body

Every route reads its query string through one `@Query() query: XQueryDto`, built from the kit in
`@appshore/kernel/shared/utils/query-dto`. There is no `@Query('x')` parameter in the starter, and a controller
never parses a number, boolean, date or enum by hand.

```typescript
import { ListQueryDto, QueryEnumList, QuerySort, QueryString } from '@appshore/kernel/shared/utils/query-dto';

export class TicketListQueryDto extends ListQueryDto {
  // inherits limit, cursor, q
  @QuerySort(TICKET_SORTS, 'newest') sort!: TicketSort;
  @QueryEnumList(TICKET_STATUSES, { name: 'status' }) statuses?: TicketStatus[];
  @QueryString({ name: 'assignee_id' }) assigneeId?: string;
}

@Get()
list(@CurrentUser() user: any, @Query() query: TicketListQueryDto) { … }
```

| Decorator                          | Reads                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `@QueryString`, `@QueryStringList` | one value as it is / several values, comma-joined or repeated                 |
| `@QueryInt`, `@QueryLimit`         | a whole number / the page size, clamped to 1…100                              |
| `@QueryBool`                       | `true` or `false` only                                                        |
| `@QueryEnum`, `@QueryEnumList`     | one / several values from a whitelist                                         |
| `@QuerySort(allowed, fallback)`    | a NAMED sort option (`newest`), never a column or a direction                 |
| `@QueryDate('from' \| 'to')`       | an ISO instant or `YYYY-MM-DD` (a UTC day, both bounds inclusive)             |
| `@QuerySearch`                     | `q`: one value, control characters removed, trimmed, capped at 200 characters |

Base classes: `CursorQueryDto` (`limit`, `cursor`), `ListQueryDto` (+ `q`), `DatedListQueryDto` (+ `from`, `to`).

**Rules:**

- The wire name is **snake_case** (`{ name: 'assignee_id' }`), the property is camelCase. Free-text search is `q`.
- An unknown param, a repeated single param or a value that does not parse (`?limit=abc`, `?flag=yes`) is a
  **400 `VALIDATION_FAILED`** whose `fieldErrors` names the wire param. There is no silent fallback.
- A text search goes into Prisma through `containsText(term)` from `list-query`, which escapes the LIKE wildcards.
  Never hand-write `{ contains: term }` for user input.
- A body whose wire shape a standard defines (RFC 7591 client registration) is a DTO marked `@ProtocolWireDto`
  (`app-validation-pipe`): it may ignore unknown fields and adds the standard's error code.
- A date a service reads as text keeps its text: `QueryCalendarDate('date_from')` (a `YYYY-MM-DD` day in the
  tenant's timezone) and `QueryDateText()` (a date or an instant) in `apps/backend/src/shared/dto/query-date-text.ts`.
  Use `@QueryDate` when the service wants a `Date`.
- A param the kit has no decorator for is a `QueryParam((raw, wire) => …)` that throws `fieldError(wire, …)`.
  A required param is one of these (see `AgentActivityQueryDto`): the kit's decorators are all optional.
- Every body is a class too: never `@Body('x')`, an inline type, an interface, `Record<…>` or a class imported
  with `import type`. The pipe cannot see any of those, so nothing is checked and nothing is refused.
- Controllers do not call `parseInt`, `parseFloat`, `Number()` or `Schema.parse()`. The DTO parses.
- Test a DTO the way a request reaches it: `readQueryDto(Dto, raw)` (kernel) or `readBodyDto(Dto, raw)` and
  `fieldErrorsOf(promise)` from `@appshore/platform/test/helpers/field-errors.helpers`.
- Held by the kit's own specs (`query-dto.spec.ts`, `list-query.spec.ts`, `app-validation-pipe.spec.ts`),
  `apps/backend/src/architecture/field-errors.spec.ts`, and the ratchet rules `input/body-is-a-dto-class`,
  `input/query-is-a-dto`, `input/no-number-parse-in-controllers`, `input/no-schema-parse-in-controllers` and
  `naming/snake-case-query-keys` in `api-contract.spec.ts`. The starter's routes pass all five.

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

**An app-owned vocabulary is a string plus a registry, not an enum.** When the foundation defines a column whose
values every product extends (notification types, deadline kinds, event names, job names), a Prisma enum would force
each product to edit `foundation.prisma`. Those columns are `VarChar(60)`, listed in `ALLOWED_STRING_COLUMNS` with
the registry named, and the registry (an `as const` list in the app's `platform-glue/`) is checked at boot. Notification
types are the decided example: `PLATFORM_NOTIFICATION_TYPES` in `@app/shared-types` plus the app's
`platform-glue/notifications/notification-types.ts` (see section 16).

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

### 8.1 The Outbox: an event exists if and only if its write committed (NON-NEGOTIABLE)

The decision is the ADR "Outbox and deadlines" (`docs/adr/`). Raise every domain event with a write behind it
through `OutboxService` (`@appshore/platform/infrastructure/events/outbox.service`), inside the transaction of
that write:

```typescript
const project = await this.outbox.transaction(async (tx, emit) => {
  const row = await tx.project.update({ where: { id }, data: { status } });
  await emit(DOMAIN_EVENTS.PROJECT_UPDATED, tenantId, { projectNumber: row.projectNumber }, actor);
  return row;
});
// The event is published here, after the commit. A rollback publishes nothing.
```

- `emit` takes the same arguments as `DomainEventService.emit` and writes an `outbox_events` row on `tx`. After the
  commit the events are published in order through `DomainEventService.publish(event)` (the hot in-process bus,
  then the durable `events` queue), keeping the row's id, and the rows are marked published.
- Publishing never fails the caller. Whatever did not publish (a crash, an unreachable Redis) is published by the
  relay, the `outbox-relay` job on `bulk-ops`, every 10 seconds.
- Do every write the event describes on `tx`, never on `this.prisma`. Keep external calls (HTTP, AI, queues) out of
  the callback: the transaction is capped at 15 seconds (`OUTBOX_TRANSACTION_TIMEOUT_MAX_MS`).
- Code that already owns its transaction stages with `outbox.stage(tx, …)`, keeps the returned events and calls
  `outbox.publishStaged(events)` after the commit. On a hot path that must not wait on Redis (the AI ledger write),
  start `publishStaged` without awaiting it (`void`): it never throws, and the relay covers what it misses.
- Do work that is not part of the change (cache busts, notifications) after the transaction returns.
- In unit specs use `createMockOutbox(prisma)` from `@appshore/platform/test/mocks`: `outbox.emit` records what was
  published, and a callback that throws publishes nothing, so a "rollback publishes nothing" test is one line.

**Signals.** An event with no write behind it (a budget breach raised on every AI pre-flight, the in-process
`NOTIFICATION_SENT` push) may use `DomainEventService.emit` directly, and only with an entry in
`apps/backend/src/architecture/no-direct-emit.allowlist.json`: file, count and reason. `no-direct-emit.spec.ts`
counts every `DomainEventService.emit` or `.publish` and every `new DomainEvent(` outside the outbox, and fails on a
new one, a stale entry or a missing reason. A change is never a signal.

**Consumers are idempotent (delivery is at least once).** A crash after publish and before the mark publishes the
same event again, and a failed durable job retries. Key every consumer on the event id, or make it re-read state:

| Consumer                                       | What makes a second delivery a no-op                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Durable enqueue                                | the BullMQ job id is `<event name>-<event id>`                                                    |
| Event log                                      | upsert on the event id                                                                            |
| Outbound webhooks                              | one delivery-log row per event and subscription, reused; the job id is `webhook-<event id>-<sub>` |
| Cache invalidation, SSE bridge                 | deleting a key or sending a refetch signal twice is harmless                                      |
| A new `@OnEvent` listener or queue job you add | key its writes and job ids on `event.id`, or re-read state before acting                          |

`apps/backend/src/platform-glue/events/__tests__/double-delivery.spec.ts` publishes one event twice through the
real listeners; extend it when you add a consumer.

**Listeners:**

- Never `await` slow listeners on the hot path — they'll block the response. Heavy work (dispatch, ML, external
  calls) belongs in the durable processor or its own queue.
- Listeners that NEED durability (webhooks, audit persistence) subscribe on the durable processor, not the hot bus.
- Listeners that CAN be lossy (cache busting — re-fetched on next read; SSE — clients reconnect) live on the hot bus.
- A relayed event fires its in-process listeners in the process that ran the relay, so an SSE client on another
  process sees the change on its next fetch.

### 8.1a Deadlines: a timer is a row (NON-NEGOTIABLE)

The decision is the ADR "Outbox and deadlines". A one-off timer tied to a write ("remind the approver in 3 days",
"expire the offer at midnight") is a `deadlines` row, written with `DeadlineService`
(`@appshore/platform/infrastructure/deadlines/deadline.service`) on the write's own transaction. Never a delayed
BullMQ job, a `setTimeout`, or a workflow-engine sleep: those are lost or orphaned when the write rolls back or the
subject changes.

```typescript
await this.outbox.transaction(async (tx, emit) => {
  const offer = await tx.offer.update({ where: { id }, data: { status: 'SENT' } });
  await this.deadlines.schedule(tx, {
    tenantId,
    kind: DEADLINE_KINDS.OFFER_EXPIRY,
    subjectType: 'offer',
    subjectId: offer.offerNumber, // a public id, never an Int primary key
    dedupeKey: `offer:${offer.offerNumber}:expiry`, // scheduling the key again supersedes the pending row
    dueAt: offer.expiresAt,
  });
  await emit(DOMAIN_EVENTS.OFFER_SENT, tenantId, { offerNumber: offer.offerNumber }, actor);
});
// Withdrawn? Cancel in that write's transaction:
await this.deadlines.cancel(tx, { tenantId, subjectType: 'offer', subjectId: offerNumber }, 'withdrawn');
```

- **Kinds are the app's.** Declare each in `apps/backend/src/platform-glue/deadlines/deadline-kinds.ts`
  (`DEADLINE_KINDS`, `as const`). `Deadline.kind` is a VarChar(60), not a Prisma enum (allowlisted in
  `schema-enum-conventions.spec.ts`), so a product never edits the foundation schema to add one.
- **One handler per kind.** It implements `DeadlineHandler`, injects `DEADLINE_HANDLERS` and calls
  `register(this)` in `onModuleInit`; its module imports `DeadlinesModule`. A second handler for a kind throws at
  boot. A kind with no handler is retried with backoff and shows as failing on the Timers page.
- **The handler re-reads Postgres.** The row's `payload` is a hint, never the truth. Return `{ outcome: 'fired' }`
  when it did its work (or found it done), `{ outcome: 'cancelled', reason }` when the timer no longer applies,
  `{ outcome: 'reschedule', dueAt }` when the subject's due time moved. It must be safe to run twice (a crash
  between the handler and the stamp re-runs it once the lease lapses), it has 60 seconds, and its own writes and
  events go through `OutboxService.transaction`.
- **Throwing is fine.** The sweeper records `lastError`, backs off (30 seconds doubling to an hour) and retries for
  ever. It never gives up on a timer; a broken handler shows as failing on `/admin/timers`.
- **The sweeper** is `DeadlineSweeper`, the `deadline-sweep` job on `bulk-ops`, ticking every 30 seconds with no
  `jobSchedule` row needed (a row `('maintenance', 'deadline-sweep')` pauses or retunes it). It shares the lane
  with the relay and data retention at concurrency 1, so a long retention run makes timers late by that long.
- **Tests.** Unit specs use `createMockPrisma()` (it has `deadline`). `platform-glue/deadlines/__tests__/
deadlines.integration.spec.ts` shows how to register a test kind and drive the real sweeper on a real database.

### 8.2 SSE Bridge — Tenant vs User Scope

The SSE bridge (`platform-glue/sse/domain-event-sse-bridge.service.ts`) translates domain events to SSE events and decides who receives them. Two scopes:

- **Tenant-scoped** (default) — broadcasts to every connection authenticated as that tenant. Use for shared workspace data.
- **User-scoped** — payload includes `recipientUserIds: string[]`. The bridge unicasts to those users only and **strips `recipientUserIds` before serialization** so the routing field never reaches the wire. Use for personal notifications, private chat updates, AI results.

When adding a new domain → SSE mapping, decide scope first. Tenant-scoped events with leaked PII (e.g. user emails) are a privacy bug — pick user-scope and use `recipientUserIds`.

---

## 9. BullMQ Queue Patterns

**Queue topology** — queues are grouped by failure-domain tier. Source of truth: `@appshore/kernel`, `infrastructure/queue/queue.constants.ts`.

| Tier                            | Queue            | Purpose                                            |
| ------------------------------- | ---------------- | -------------------------------------------------- |
| 1 — Real-time (humans waiting)  | `events`         | Durable event bus, fan-out spine                   |
|                                 | `notifications`  | Outbound SMS/push/email/in-app (priority enforced) |
|                                 | `webhooks`       | Outbound webhooks to customer systems              |
| 2 — Compute                     | `ai-interactive` | User-blocking AI (chat, copilot)                   |
|                                 | `ai-background`  | Autonomous/background AI work                      |
| 3 — Background (eventual is ok) | `bulk-ops`       | Mass operations + system cleanup                   |

**Product vocabulary lives in the app (NON-NEGOTIABLE).** The kernel's `QUEUE_NAMES`, `*_JOB_NAMES`,
`TYPE_DISPLAY_NAMES`, `JOB_CATEGORIES` and `MANUAL_CATEGORY_TYPES` list only what the foundation runs, and
`architecture/foundation-vocabulary.spec.ts` pins them. Your queues and jobs go in
`apps/backend/src/platform-glue/queue/job-names.ts`: `APP_QUEUE_NAMES`, `APP_JOB_NAMES` (one object per queue, keyed by
the queue's constant key), `APP_JOB_DISPLAY_NAMES`, `APP_JOB_CATEGORIES`, `APP_MANUAL_TYPES`. `queue.module.ts` merges
them with the kernel's (`buildJobVocabulary`), binds the result to `JOB_VOCABULARY` and registers every app queue; a
key defined twice fails at boot. `JobService`, `ScheduleManagerService` and the admin Jobs routes read that merged
vocabulary, so an app category shows, schedules and retries like a kernel one. Keep the tier discipline when you add
a queue (isolate slow or vendor work from user-facing work), and give it its one dispatcher.

```typescript
// platform-glue/queue/job-names.ts
export const APP_QUEUE_NAMES = { REPORTS: 'reports' } as const;
export const APP_JOB_NAMES = { /* kernel queues: {} */ REPORTS: { BUILD: 'report-build' } } as const;
export const APP_JOB_DISPLAY_NAMES = { 'report-build': 'Report Build' } as const;
export const APP_JOB_CATEGORIES = {
  reports: { display: 'Reports', queue: 'reports', requiredIntegration: null, tenantVisible: true },
} as const;
```

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

Job names live in constants: the foundation's in per-queue `*_JOB_NAMES` in `queue.constants.ts` (e.g.
`NOTIFICATIONS_JOB_NAMES.DIGEST`), yours in `APP_JOB_NAMES` (e.g. `APP_JOB_NAMES.BULK_OPS.REVALIDATE`). Never add a new
`@Processor` class to an existing queue — add a handler and register it under the queue's token.

**Wire every handler, or it never runs.** A dispatcher completes a job whose name no handler claims as a silent
no-op. On `bulk-ops` the handlers are listed in the factory of
`platform-glue/queue/dispatchers/bulk-ops-queue.module.ts`, and `architecture/bulk-ops-handlers.spec.ts` maps every
`BULK_OPS_JOB_NAMES` and `APP_JOB_NAMES.BULK_OPS` entry to its handler file and fails when a name has no handler in that
factory. The outbox
relay (`outbox-relay`, every 10 seconds) runs there, beside data retention, at concurrency 1: a long job on the lane
delays crash recovery by that long.

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

**API and worker roles: one switch, shipped off.** `main.ts` (API) and `worker.ts` boot the same `AppModule`, so by
default both consume every queue and the worker task is optional extra capacity. `QUEUE_PROCESSORS_ENABLED=false`
makes a process producer-only: `applyQueueProcessingMode()` (`@appshore/kernel`,
`infrastructure/queue/queue-processing-mode.ts`, held by its spec) swaps BullMQ's worker class for one that never
starts, before the app is created. Every `@Processor` stays wired; `queue.add()` and repeatable registration are
unaffected; Desk workflow functions, when the product kept Desk, run over HTTP and stay in the API. Only `main.ts` calls it, so no value of the key can
stop the worker.

- Ships off: Terraform `api_queue_processors_enabled` defaults to `true`, and the API task gets no env var.
- To turn it on: run at least one worker task first (`worker_desired_count > 0`), then set
  `api_queue_processors_enabled = false`. A precondition in `ecs.tf` refuses `false` while there is no worker, because
  a producer-only API with no worker stops every queue, the outbox relay and the deadline sweeper included.
- Roll back by setting the variable back to `true`.
- Set the key only through Terraform, never in Doppler: `doppler run` lets Doppler values override the task
  environment, which would take the switch out of Terraform's hands.
- With it on, every job-originated and relayed event fires its in-process listeners in the worker, where no SSE
  client is connected: screens see the change on their next fetch (ADR "Outbox and deadlines", known limits).
- A second worker lane (say, AI work in its own task) is a lane gate: register each processor only when its lane
  runs in this process, and hold it with a spec. The template has one lane, so it ships none; add the gate when you
  add the lane, not before.

---

## 10. Error Handling

### 10.1 Exception Rules (NON-NEGOTIABLE)

**Always throw a NestJS exception, or one of the code-carrying factories, in services and controllers:**

```typescript
import { duplicate, fieldError, invalidState, stale } from '@appshore/kernel/shared/errors/api-errors';

throw new NotFoundException('This project was not found'); // 404 NOT_FOUND
throw new ForbiddenException('Only the owner can do this'); // 403 FORBIDDEN
throw fieldError('email', 'Enter a valid email address'); // 400 VALIDATION_FAILED + fieldErrors.email
throw invalidState('This invoice is already paid'); // 409 INVALID_STATE (illegal transition, closed, decided)
throw duplicate('A project with this name already exists'); // 409 DUPLICATE
throw stale('This was just changed by someone else. Refresh and try again'); // 409 STALE
```

**One meaning per status.** 400 = bad input, and it names the field in `fieldErrors`. 401 = not signed in.
403 = signed in but not allowed. 404 = missing, **or in another tenant** (never confirm that a record exists across
tenants). 409 = any state conflict: an illegal transition, a duplicate, a stale write. 429 = rate limited. 422 is not
used. If no field is at fault, the answer is not a 400: a caller with no workspace is a 403 with a code
(`NO_TENANT`), a session that cannot be identified is a 401, a thing that is not there is a 404. A path param can
be the field (`fieldError('namespace', …)`). The rule `errors/controller-400-names-its-field` fails on a
`new BadRequestException('…')` in a controller. Error copy carries no internal id, storage key or raw exception
text (`errors/no-internals-in-messages`): log it, and say what happened in plain words.

**Every error carries a machine `code`.** A bare Nest exception gets the code its status implies (404 →
`NOT_FOUND`, 409 → `INVALID_STATE`). Use a factory when the code is not the status default. The shared codes are
`ApiErrorCode` in `@app/shared-types`: `VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND,
METHOD_NOT_ALLOWED, INVALID_STATE, STALE, DUPLICATE, IDEMPOTENCY_KEY_REUSED, IDEMPOTENCY_KEY_IN_USE,
PAYLOAD_TOO_LARGE, RATE_LIMITED, UNSAFE_WEBHOOK_URL, UNAVAILABLE, INTERNAL` (the two idempotency codes: section 2.5). A domain may add its own by throwing `{ code: 'MY_CODE', detail: '…' }`
(`FEATURE_DISABLED`, `PASSWORD_NOT_SET`); it passes through unchanged. Add a code to `ApiErrorCode` only when every
domain shares it.

**Parse a Zod schema at the boundary with `parseWithSchema(schema, input)`**, never `Schema.parse()`: it answers a
400 with `fieldErrors`. (A `ZodError` that still reaches the filter is also mapped to a 400, never a 500.)

**NEVER `throw new Error('...')` in service/controller code.** A plain `Error` becomes a generic 500 and its
message is only logged.

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

### 10.4 The Error Envelope (NON-NEGOTIABLE)

Every error body is one shape, written in one place (`writeErrorEnvelope` in
`@appshore/platform/shared/filters/error-envelope`). The global `HttpExceptionFilter` delegates to it.

```json
{
  "statusCode": 409,
  "code": "INVALID_STATE",
  "detail": "This invoice is already paid",
  "fieldErrors": { "email": "Enter a valid email address" },
  "timestamp": "2026-07-06T...",
  "path": "/api/v1/...",
  "method": "POST",
  "debugDetail": "Technical details..."
}
```

- These eight keys and **no others**. `fieldErrors` only on a 400. `debugDetail` only in development. There is no
  `message` and no `error` key. Anything else a thrower attaches is dropped, so do not invent a key: put the fact
  in `code` or `detail`.
- Prisma: P2002 → 409 `DUPLICATE`; P2025 → 404 `NOT_FOUND`; P2003 and P2014 → 409 `INVALID_STATE`; P2007 → 400.
  An unknown error → generic 500 `INTERNAL`.
- A route that writes its own response (`@Res()`, a stream) never reaches the filter. It answers a failure with
  `writeErrorEnvelope(res, req, error)`, which returns `false` once headers are sent. Never hand-write
  `res.status(…).json({ message })`.
- Two exceptions, both set by a standard. The OAuth protocol routes answer `{ error, error_description }` through
  `@UseFilters(OAuthErrorFilter)`; throw `oauthError(OAUTH_ERROR.INVALID_GRANT, '…')` there. A route that takes an
  API key or an OAuth token adds `WWW-Authenticate` to its 401 with `@UseFilters(BearerChallengeFilter)`; the body
  stays the envelope.
- Held by `packages/appshore/platform/src/shared/filters/error-envelope.spec.ts` and
  `apps/backend/src/architecture/error-envelope.spec.ts` (boots the real filter and pipe; a body with any other key
  fails).

**Logging:** 5xx → `error` with stack trace. 4xx → `warn`. Silent paths: `/sse/`, `/health/`.

### 10.5 Validation Errors

The global `AppValidationPipe` (`@appshore/kernel/shared/utils/app-validation-pipe`) answers a DTO failure with:

- `code`: `VALIDATION_FAILED`
- `detail`: the one message, or a summary ("3 fields have validation errors")
- `fieldErrors`: field name → message, for inline display. Nested fields use dot paths (`items.0.title`); a query
  DTO's field is its wire name (`assignee_id`).

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

**The resolver is the only way to get a model (NON-NEGOTIABLE).** `AiRouteResolver.resolve(tenantId, need)` in `apps/backend/src/domains/ai/routing/` picks the tenant's route for `'language'` or `'embedding'`, applies the tenant's retention policy, and fails closed with a typed error: `AiNotConfigured` (503, nothing serves the need), `ZeroRetentionUnavailable` (400, a route exists but the tenant requires zero retention and it keeps data), `AiModelNotOnRoute` (503, the catalog has no id for that alias on that route). Never catch one of these to fall back to another provider. `resolvePlatform(need)` is only for platform-owned content with no tenant (the global knowledge base). The ADR "AI provider routing is per tenant; retention is enforced in the resolver" has the decision.

**Aliases, never model ids:**

| Alias      | Use For                                                         |
| ---------- | --------------------------------------------------------------- |
| `fast`     | Classification, short summaries, memory extraction (effort low) |
| `standard` | Chat, structured extraction (effort medium)                     |
| `powerful` | Complex extraction, fallback for critical tasks (effort medium) |

Model ids live only in `MODEL_CATALOG` (`domains/ai/routing/model-catalog.ts`): one row per alias, one id column per route family. A model bump is a change there plus pricing rows, never an env var. `model-id-literals.spec.ts` fails on a model id anywhere else. Env vars hold route keys, never model ids.

**No provider client, no `process.env` outside `AI/routing/`.** Provider packages (`@ai-sdk/<provider>`, `@openrouter/*`, `openai`) and `createGateway` are imported only under `domains/ai/routing/` (the route registry builds every client) and `domains/ai/moderation/` (`ai-provider-clients.spec.ts`). Routing reads its keys through `ConfigService` from the zod schema, never `process.env` (`ai-routing-config.spec.ts`). The `ai` package itself (`generateText`, `embed`) is fine anywhere: it calls the model it is handed.

```typescript
// Structured output: aiContext (the tenant to route by and to bill) and maxOutputTokens are required.
const { object } = await this.structuredOutput.extract({
  messages, schema, systemPrompt, modelAlias: 'fast', timeoutMs: 30_000,
  maxOutputTokens: OUTPUT_CEILINGS.VERDICT,
  aiContext: { tenantId, surface: AiSurface.DESK_STEP },
});

// A raw AI SDK call (rare; document the reason): resolve first, then call the route's model.
const route = await this.aiRouteResolver.resolve(tenantId, 'language');
const result = await generateText({ model: route.languageModel('standard'), maxOutputTokens: OUTPUT_CEILINGS.SUMMARY, ... });

// A Mastra agent has no model of its own: pass the resolved one per call.
const requestContext = new RequestContext([[REQUEST_MODEL_KEY, route.languageModel('standard')]]);
```

**Every model call names an output ceiling** from `OUTPUT_CEILINGS` (`domains/ai/routing/output-ceilings.ts`): `maxOutputTokens` on every `extract` and AI SDK call, `modelSettings.maxOutputTokens` on Mastra agent calls (`model-calls-name-a-ceiling.spec.ts`). Thinking is billed as output on the 5.5 models, so no ceiling is below 1,024.

**Every embedding names its tenant and its intent.** `EmbeddingService.embedText(text, aiContext, intent)` and `embedBatch(texts, aiContext, intent)`: `aiContext` routes and bills the call, `intent` is `'document'` for text you store and `'query'` for text you search with (Embed v4 is asymmetric; mixing them silently degrades retrieval). Every vector is checked at 1536 dimensions. `embedForPlatform(texts, intent)` is for global content only (the knowledge-base ingest, and `kb:eval`'s queries). A search must not fail because the query cannot be embedded: catch the error and answer from full-text (the knowledge base does).

**Knowledge-base rules (NON-NEGOTIABLE):**

- **The server picks the audience.** `search-kb` and `get-product-info` take no audience argument; the audiences come from `kbAudiencesFor(role)` (`domains/ai/knowledge-base/kb-audience.ts`): `all`, plus the role's own audience from `ROLE_AUDIENCE` (empty in the starter). `KnowledgeBaseService` searches exactly the set it is given and refuses an empty one. A new audience is a `ROLE_AUDIENCE` entry; the content loader refuses a file tagged for an audience no role reads. The tool pipeline drops every `_`-prefixed key a caller sends and injects `_role` itself (the acting person's `WorkspaceMember` role in the workspace; null for Desk), so a role audience reaches exactly that role's members and nobody can pick one by sending `_role` (§23).
- **Search never fails because of routing.** `hybridSearch` fuses a vector list and an any-term full-text list by reciprocal rank (`retrieval/rank-fusion.ts`), at most two chunks per source file. When the query cannot be embedded it answers from full-text, which sends nothing to a provider.
- **The ingester owns only its rows.** `pnpm seed:knowledge` syncs by content hash and touches only rows whose `sourcePath` it wrote; a row you insert yourself keeps a null `sourcePath` and is never deleted. Changing what the chunker emits for the same input means bumping `CHUNKER_VERSION`, which re-embeds the corpus on the next sync.

**Measuring retrieval and other AI behaviour (evals):** ship one eval that runs, not a framework. `pnpm kb:eval` (`domains/ai/knowledge-base/eval/`) is the worked example: pure scoring (`kb-eval.ts`, recall at k and mean reciprocal rank, unit-tested), a command that asks a golden set (`content/kb-eval/golden.json`) through the same code path and the same audience rule production runs. The method for any eval you add:

1. Gold labels come from a person reading the source, never from the output of the tool under test. A label names a file or record, so a rename fails the eval's data spec instead of scoring as a silent miss.
2. Matching is mechanical (an id or path in the top k, an exact field), never a model judging a model.
3. Reports are dated and committed beside the change they measured (`pnpm kb:eval --report <folder>`), with the mode they ran in, counted from the run rather than from config (for `kb:eval`: `hybrid`, `full-text`, or `mixed` with how many queries fell back to full-text, since a configured route with a failing key embeds nothing), so a later run compares like with like.
4. Measurement switches are ignored on every deployed task: resolve them to unset in `config/configuration.ts` when `isProductionEnv()` is true, as `AI_PROMPT_CACHE_OVERRIDE` and `AI_USAGE_CAPTURE_DIR` are.
5. An eval that spends money (a live model or embedding call) is run by a person, never by CI or a hook; its pure scoring still runs under `pnpm test`.

**Fallback pattern (document extraction):**

1. Try the `standard` model first
2. On failure, retry with the `powerful` model
3. Return parsing metadata: `{ fallbackUsed, fallbackReason, model, durationMs }`

**Prompt management:** prompts load through `PromptingService` (`apps/backend/src/domains/prompting/`) — Langfuse primary with a code-registered fallback. Register prompts via the domain's registrar; names live in `PROMPT_NAMES` (`prompting.types.ts`).

**Where each AI path is sanctioned:** all conversational/agent AI goes through the Mastra agent runtime (`domains/ai/`). Workflow-shaped exceptions call the AI SDK through `StructuredOutputService` (document/structured extraction) and, when the product kept Desk, Desk steps via `runStructuredLlmStep()`, orchestrated by its durable workflow engine, not BullMQ. Don't add new direct-SDK callsites without a documented reason.

**Cost + moderation:** every AI call lands a row in the per-tenant ledger (`ai_invocations`) with the route that served it (`routeId`, `credentialType`); user-facing chat goes through moderation. Don't bypass either.

**Cost rules (NON-NEGOTIABLE):**

- **Read usage through `usageFromAiSdk`** (`domains/ai/infrastructure/telemetry/usage-from-ai-sdk.ts`) for every AI SDK or Mastra result you record: it reads cache reads and cache writes on the Anthropic, OpenRouter and Bedrock shapes and sums them over a multi-step run. Never read `usage.inputTokens` by hand. `promptTokens` includes the cached and written tokens; `computeCost` prices plain input, cache reads (`cachedInputPerMtokUsd`) and cache writes (`cacheWriteInputPerMtokUsd`, else the input rate) apart.
- **The AI budget counts platform-paid spend only.** The platform paid when `credentialType` is null or starts with `PLATFORM_`; the one statement of the rule is `PLATFORM_PAID_SQL` / `payerOf` in `telemetry/platform-paid.ts`, and the `vw_ai_cost_*` views carry `platform_cost_usd` beside `total_cost_usd`. A spend sum or report that feeds the cap uses it.
- **Check the cap only when the platform pays:** `if (route.payer === 'PLATFORM') await aiTelemetry.assertBudget(tenantId)`, after resolving the route and before the model call. A workspace on its own key is never capped.
- **A provider credit refusal is a budget error.** In a model call's catch block, `throw mapProviderRefusal(err, tenantId, route)` (`telemetry/ai-provider-credit-refused.error.ts`): a 402 or "credit too low" body becomes `AiProviderCreditRefused`, which every surface already handles as `AiBudgetExceededError`, and a platform-paid one is logged at error level in `logPlatformCreditRefusal`.
- **Budgets come from the plan.** `AiBudgetSeederService` writes a workspace's caps from `PLAN_AI_BUDGETS` on approval, plan change (`planAssigned`), personal signup and single-mode boot. It owns a row only while `notes` starts with `plan:` (`plan:DEFAULT` on a row created lazily with the defaults). An admin edit writes its own note and takes the row over; never write a `plan:` note from anywhere else.
- **A changed monthly hard cap goes to OpenRouter too.** With sub-keys on (`OPENROUTER_PROVISIONING_KEY` and `AI_CREDENTIALS_KEY`), each workspace calls `platform-openrouter` with its own key, capped at its monthly hard budget at OpenRouter's edge. Code that writes `TenantAiBudget.monthlyHardUsd` calls `OpenRouterProvisioningService.syncLimit(tenantId, cap)` after the write, fired and not awaited (it never rejects), as the seeder and the admin editor do. A sub-key is platform-paid: it is never a workspace credential and never in the tenant pool. Never mint a key at OpenRouter you could not store; the service checks the credentials key first and revokes a key whose store failed.
- **Prompt caching is the route's.** Each registry entry declares `promptCache` (`anthropic`, `openrouter`, `bedrock` or `none`) and the resolver wraps its language models with the breakpoints (`routing/prompt-cache.ts`). Don't set `cacheControl` by hand on a message. `AI_PROMPT_CACHE_OVERRIDE=none` turns it off on a local run only.

**Workspace credential rules (bring-your-own-key, NON-NEGOTIABLE):**

- **A secret is never read back.** A pasted key exists only inside `AiCredentialConnectService.connectKey`; it is stored only as the `CredentialCryptoService` envelope (AES-256-GCM, bound to `tenantId:credentialPublicId`) and leaves the API only as `lastFour`. Every credential response goes through `toAiCredentialSummary`; never return a row, the envelope, `keyVersion` or `externalId`. Provider error text is passed through `redactSecret` before it is stored, logged or returned. Events carry the public id and type only.
- **A failing workspace key is never served on the platform key.** A pool is the workspace's credentials or the platform's routes, decided per need, never both. A compatible credential that is FAILING, or whose secret cannot be decrypted, raises `AiCredentialFailing` (503); never catch it to retry on a platform route. A credential the retention policy rules out is inert (treated as absent), never deleted.
- **Status moves only through a test.** `validate` (and the daily sweep, which calls it) is the only writer of ACTIVE and FAILING. A provider credit refusal on a workspace key is recorded through `route.reportCreditRefusal` (which `mapProviderRefusal` calls) and leaves the status ACTIVE.
- **The switch is `AI_CREDENTIALS_KEY`.** Code that needs to know whether bring-your-own-key is on asks `CredentialCryptoService.isConfigured()`; there is no other flag and no fallback key.
- **A new credential type** is an `AiCredentialType` value plus a `TENANT_CREDENTIAL_CAPABILITIES` entry (serves, retention, prompt cache, a builder that calls the provider only through the catalog), held by `route-registry.parity.spec.ts`.
- **A workspace AWS role is assumed by the role it trusts.** `BEDROCK_ROLE` and `probeBedrock` assume the workspace role with the backend's own ambient credentials (`fromTemporaryCredentials` with no `masterCredentials`, `new STSClient({ region })` with none), because the workspace's trust policy names `PLATFORM_ASSUME_ROLE_ARN`, the task role. Never chain through another role. The external id is recomputed on the server (`aws-role-naming.ts`), never taken from a client, and a role is stored only after the two-direction check passes: with the id the assume succeeds, without it the assume is refused with access denied (any other error is a refusal). Held by `bedrock-ambient-credentials.spec.ts` and the probe spec.

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
Service stages via OutboxService → (after commit) hot bus → DomainEventSseBridge → SseService.emitToTenant()
```

**SseService methods:**

- `emitToTenant(tenantId, eventType, data)` — broadcast to all users in tenant
- `emitToUser(userId, eventType, data)` — unicast to specific user

**When adding SSE for a new domain:** update the 5 files listed in §8 (Domain Events).

---

## 14. Auth & Guards

**Global guard chain (AppModule, order matters):**

1. `ThrottlerGuard` — rate limiting (counted in Redis; per signed-in user or OAuth client + user, otherwise per client IP; a `@Public()` route is always per client IP unless `OAuthTokenGuard` protects it, where a verified OAuth token is per client + user; `THROTTLE_LIMIT` / `THROTTLE_TTL_MS`; see `apps/backend/src/bootstrap/edge-throttle.ts`)
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
- `@SkipThrottle()` — exempt from rate limiting (health and SSE routes only; everything else that needs room gets `@Throttle(GENEROUS_THROTTLE)`, section 2.3)

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

**Notification types are strings with an app registry (NON-NEGOTIABLE).** `notifications.type` and
`notification_deliveries.type` are `VarChar(60)`; there is no `NotificationType` Prisma enum. The platform's types are
`PLATFORM_NOTIFICATION_TYPES` (`@app/shared-types`; value bag `PlatformNotificationType.X`). Yours go in
`apps/backend/src/platform-glue/notifications/notification-types.ts` (`APP_NOTIFICATION_TYPES`, `as const`), with
their policies and WhatsApp templates in `app-notification-policies.ts`, typed over the union of the two lists so the
compiler holds every app type to a policy. `hooks.module.ts` binds them to `NOTIFICATION_TYPES`,
`NOTIFICATION_POLICIES` and `WHATSAPP_TEMPLATES`. `NotificationPolicyRegistry` refuses to boot when a declared type
has no policy, a policy names an undeclared type, or a type is declared twice;
`notification-policy-parity.spec.ts` holds the same in the unit suite. Never add an app type to
`PLATFORM_NOTIFICATION_TYPES`.

```typescript
// platform-glue/notifications/notification-types.ts
export const APP_NOTIFICATION_TYPES = ['INVOICE_OVERDUE'] as const;
// platform-glue/notifications/app-notification-policies.ts
export const APP_NOTIFICATION_POLICIES = {
  INVOICE_OVERDUE: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.TIMELY, {
    email: CHANNEL_RULES.DEFAULT,
  }),
};
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
- `@Throttle(GENEROUS_THROTTLE)`, never `@SkipThrottle()`: a signed route still spends CPU on every forged request
- An entry in `PROVIDER_ROUTES` (`api-contract.allowlist.json`) naming the vendor document that fixes the format

**Outbound** (`apps/backend/src/platform-glue/webhooks/`):

- Subscription-based: tenants register webhook URLs + event patterns
- BullMQ queue delivery (the `webhooks` queue)
- Signed per Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,` + base64 HMAC-SHA256 over `id.timestamp.body`); secrets are `whsec_…` and rotate with an overlap window (`POST /webhooks/:id/rotate-secret`)
- SSRF guard (`@appshore/kernel` `webhook-url.validator`): the URL and every resolved address must be public, checked on save and again on the delivery's own connection; no redirects
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
// main.ts
app.useGlobalPipes(new AppValidationPipe());
```

`AppValidationPipe` is Nest's `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform` on, the
`fieldErrors` exception factory (§10.5), and the query-DTO rules of §4.1. A test that boots a controller uses the
same class, so it validates exactly as production does.

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
- NEVER let Prisma errors bubble unhandled — the global filter maps P2002/P2025/P2003/P2014/P2007, but services should still catch domain-specific cases
- NEVER write an error body by hand (`res.status(400).json({ message })`) or attach extra keys to an exception — the envelope is eight fixed keys (§10.4)
- NEVER answer a 400 that names no field — it is a 401, 403 or 409 with a `code`, or it names the field with `fieldError()`
- NEVER pass raw external API error messages to NestJS exceptions — log the details, throw a user-friendly message (§10.3)
- NEVER include database field names, internal IDs, or Prisma error codes in exception messages — these leak to the frontend toast (§10.2)
- NEVER `throw new InternalServerErrorException(error.message)` for caught external errors — the message may contain API keys, tokens, or internal details

**Data integrity:**

- NEVER create parent + children as separate operations — wrap in `this.prisma.$transaction()`
- NEVER check-then-create without atomicity — use `prisma.model.upsert()` instead of `findUnique → if null → create`
- NEVER return an unbounded list: a list that can grow is a cursor list (§3.3); any other `findMany` a GET reaches has a `take`, or a `BOUNDED_READS` entry that says why its size is fixed
- Financial operations (payments, invoices) MUST check for duplicates before creating
- NEVER emit a domain event after the commit (`await this.events.emit(...)` below a write) or with raw `EventEmitter2` — stage it in the write's transaction through `OutboxService` (§8.1)

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
- [ ] Domain events: staged in the write's transaction with `OutboxService.transaction((tx, emit) => …)`; every consumer safe to run twice for one event id (§8.1)
- [ ] State machine: status transitions go through a dedicated method that whitelists allowed `from → to` (§3.1)
- [ ] Multi-tenant isolation: every query filters by `tenantId`; record-level checks for owned resources (§2.1)
- [ ] Feature flags: `@RequireFeature` at controller, after `@Roles` (§2.2)
- [ ] Lists: a cursor list with a public-id tiebreak and a page-walking spec; every other read bounded (§3.3)
- [ ] IDs: the record crosses the API by its public id; no numeric id in a param, DTO, response or tool (§3.4)
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

- Identity is server-injected: `_tenantId`, `_userId` (wire id), `_userDbId` and `_role` come from the executor,
  spread last. A tool schema declares no `_`-prefixed field and no tenant or user field.
- All queries filter by `tenantId` (+ lifecycle status where applicable)
- Query tools return structured data; never a numeric id (§3.4)
- Action tools resolve entities by public business ID (`projectNumber`) before calling services
- Errors: throw the service's `HttpException` (its message and code reach the caller) or let it propagate. Never
  `return { error: err.message }`: anything that is not an `HttpException` is logged and answered with a generic
  message by `toolFailure` (`mcp/tools/tool-error.ts`), and `mcp-arg-validation.spec.ts` fails on the raw form.

### 23.1 The tool pipeline (NON-NEGOTIABLE)

Every tool call, from chat (`McpToolService`), the external MCP server (OAuth clients, API keys) and Desk
(`execute.step.ts`), runs through `InvocationPipelineService.run`, in this order: scope (exists, not never-external
for a third party, granted), arguments (parsed against the tool's own zod schema; every `_` key the caller sent is
dropped; a failure is `VALIDATION_FAILED` with `fieldErrors`), role, plan, confirmation, audit + execute, errors.

- **No path around it.** No file calls a tool method except `ToolExecutorService.invoke`. A chat call with no
  pipeline is refused (`tool_pipeline_unavailable`); there is no fallback, no anonymous toolset, and no
  `getToolsForNames`. `McpToolInvocationContext` is required.
- **Scope decides write versus read.** A tool is a write when its `@RequiresScope` is not read tier
  (`ScopeRegistryService.isWriteTool`, `McpToolService.isWriteTool`). There is no hand-kept write list; chat offers
  `confirm-action` and an external agent is challenged from the scope alone.
- **Role.** A tool whose REST twin has `@Roles(...)` declares `@RestrictToRoles([...])` with the same roles. The
  pipeline reads the acting person's current `WorkspaceMember` role in the principal's workspace (the OAuth
  client's person, the API key's owner), never the persona or the home tenant. No membership row is a refusal on
  every tool, restricted or not. A chat principal's persona scopes are capped at the current role's scopes. Desk is
  exempt.
- **Plan.** A tool whose REST twin has `@RequireFeature(key)` declares `@RequiresPlanFeature(key)`. The pipeline
  runs the real `PlanGuard` against a synthetic request (`ToolAccessPolicyService.evaluateFeature`), for every
  principal kind including Desk. Never copy the plan rule.
- Role and plan run before confirmation; their refusals are plain results (`role_not_permitted`, `not_on_plan`),
  not `isError`.
- **Confirmation.** Deny by default: every principal kind but a signed-in user and a Desk duty gets a challenge
  token for a non-read tier. Desk is never challenged by the pipeline (Desk's gate step runs before every execute)
  and the tier is still written on the audit row. No tool or prompt may carry a switch that skips confirmation
  (the old `_invocationSource` on `confirm-action` was one).
- **One intent digest, single use.** A confirmation is bound to the tool and `intentDigest(schema, args)`
  (`agent-contract/intent-digest.ts`): top-level `_` keys dropped, parsed through the tool's schema, canonical JSON
  with keys sorted at every depth, SHA-256 over the exact values. Every path that records or checks a confirmation
  (the challenge token and the chat grant) calls that one function; never hash the redacted copy
  (`redactArgs` is for the invocation log only) and never `JSON.stringify` with a key list. A token or grant is
  spent with a conditional update (`updateMany` where `consumedAt: null`, then check `count`), never a read then an
  unconditional `update`, so two racing retries cannot both run. A step-up is marked only on an open row (unused,
  unexpired). `hitl_challenges` rows are deleted 24 hours after `expiresAt` by the data-retention job.
- **Chat grants (a signed-in user).** A chat write runs only against the card the person confirmed for that exact
  call in that conversation. `confirm-action` names the write tool and its exact `args`; the server
  (`McpToolService`'s intent recorder) checks it is a write the person could run (`pipeline.preflight`, steps 1 to 4) with arguments the tool accepts, records the intent (`HitlChallengeService.recordChatIntent`, explicit
  `conversationId` and `toolCallId` columns on `hitl_challenges`) and builds the card from the recorded tool and
  args, never from model prose (`buildConfirmFrame` unwraps Mastra's envelope). `POST .../resume` confirms exactly
  that card, once (a second press is 409, and a Confirm with no `toolCallId` is 400); Cancel voids it. The
  pipeline spends a confirmed grant only for the same conversation, tool and `intentDigest`
  (`consumeChatGrant`); with none it answers `confirmation_required` and changes nothing. A new user message voids
  every open card in the conversation, and the end of a resumed turn voids unspent grants. A user principal
  without a `conversationId` can never write. A chat grant is never a challenge token: `consume` and
  `markStepUpCompleted` read only rows with no conversation. A delegated sub-agent gets a read-only toolset
  (`{ readOnly: true }`: no write, no `confirm-action`).
- **External agents wait for a person.** A third-party standard write is issued as an approval request
  (`approvalRequired`, the parsed `argsPreview`) and answers `approval_required` with `approvalUrl`
  (`agentActionWebPath`, on `APP_URL` read through `ConfigService`); it runs only after a person approves it at
  `POST /agent-actions/:token/approve` and the agent replays the token. The owner's `Tenant.agentSelfConfirm`
  (`PUT /agent-policy`) switches standard writes back to self-confirm. A sensitive write always needs the PIN of the
  person acted for (`POST /mcp/hitl/:token/step-up`), whatever the policy: it is never an approval row, the Approve
  route refuses it, and it stores only `argsRedacted`. `consume` refuses without spending: `pending` (not approved,
  or no PIN yet), `denied`, `invalid`; the pipeline answers `approval_pending` / `approval_denied` /
  `hitl_invalid_or_expired`. A decision is a conditional `updateMany` on still-pending, raised with its event in the
  same `OutboxService.transaction`. Only the person acted for or a workspace owner or admin reads a request
  (`GET /agent-actions/:token`, 404 across workspaces); `argsPreview` may hold personal data, so it is never logged
  or put in an event, and it is nulled when the request is spent or denied. These routes take a person's session
  (JWT and `@Roles`); never open them to an agent credential.
- **Retry-safe creates.** A create tool with no natural key (nothing unique the caller sends, so a retry would make
  a second record) declares `idempotencyKey: idempotencyKeyArg` from `agent-contract/tool-idempotency.ts` in its
  `parameters`, and is listed in `IDEMPOTENT_CREATE_TOOLS` in `tool-idempotency.spec.ts` (a `create-*` write that
  is on neither that list nor `NATURAL_KEY_CREATES` fails the spec). The executor does the rest with the one
  `IdempotencyStore` the `Idempotency-Key` header uses, through the same `claimOrSkip` helper, with
  `requestFingerprint('tool:<name>', args)` and the scope `tdb:<tenantId>:u:<userDbId>`, per workspace and the
  person acted for; the same key and arguments within 24 hours replay the first success; the same key on another
  call is `IDEMPOTENCY_KEY_REUSED`, a retry while the first still runs is `IDEMPOTENCY_KEY_IN_USE`; a failure (or a
  throw) releases the key; a store that fails or does not answer within 2 s (`IDEMPOTENCY_STORE_TIMEOUT_MS`; the
  Redis client queues commands during an outage instead of rejecting them) runs the call without it. The key is
  taken out before the method runs, so a tool never reads it, and it is part of the confirmation digest like any
  other argument. Never build a second store or hand-roll a dedupe in a tool, and
  never declare the key on a read.
- `tools/list` serves `toolInputSchema(parameters)` (`agent-contract/tool-input-schema.ts`): `_` properties stripped,
  `_confirmToken` documented. Never build a tool's input schema another way.
- Agent rate limits (`AgentRateLimitGuard`): an OAuth client's budget is per client **and** person; OAuth clients
  and API keys also share one per-workspace ceiling (`AGENT_TENANT_CEILING_PER_MINUTE`, default 600).
- The example pair (`mcp/tools/support-ticket.tool.ts`) shows each rule, and
  `support-ticket.pipeline.spec.ts` walks it through every step. Copy its shape for a new tool.
- **Tool availability hides, it never permits.** A tool whose channel or vendor may be unconfigured (an SMS tool
  with no sending number) gets a rule in `TOOL_AVAILABILITY_RULES` (`agent-contract/tool-availability.service.ts`,
  bound in `AgentContractModule`; the starter binds none). An unavailable tool is left out of `tools/list`, every
  chat toolset and `confirm-action`, so the model never promises it. Never use a rule for who may run a tool: that
  is scope, role and plan in the pipeline.
- **MCP prompts.** Curated prompts live in `PROMPT_LIBRARY` (`assistant/prompts/prompt-registry.data.ts`, empty in
  the starter) and are served by `prompts/list` and `prompts/get`, filtered by the acting person's current
  `WorkspaceMember` role (`ToolAccessPolicyService.actingRole`, the pipeline's lookup), never the token's role. The
  authoring rules are in that file's header and held by `prompt-registry.data.spec.ts`: kebab-case names, human
  references not ids, every placeholder declared, tools named only inside one `<tools>` block and listed in
  `suggestedTools`. An undeclared or missing required argument is a 400 that names it, sent to the client as MCP
  invalid-params. A prompt is a suggestion, never a permission: the tools it leads to still run through the
  pipeline.

## 23a. Optional features (Desk)

A feature a product chooses at scaffold time (today: Desk) is reached only through
`apps/backend/src/platform-glue/features/`: `<name>.feature.ts` is the one file outside the feature's folder that
imports from it, and `OPTIONAL_FEATURES` in `index.ts` lists what the product kept. The app module spreads the
features' modules, `hooks.module.ts` binds `TENANT_PROVISION_HOOKS` to a composite of their hooks, and `main.ts`
calls each `onAppReady`. Held by `apps/backend/src/architecture/optional-features.spec.ts`.

- A Desk change stays inside `apps/backend/src/domains/desk/`.
- A Desk-only line outside that folder (an env line, a doc line, a seed row, a package script) sits between
  `feature:desk:start` and `feature:desk:end` comment lines, and its file is listed in
  `tools/init-app/features/desk.json` (`markers`). A Desk-only file goes in `paths`; a JSON key or array value in
  `jsonEntries`; an allowlist entry under the Desk folder is covered by `allowlistPrefixes`.
- A line that must stay in every product and still names `inngest` or `domains/desk` (a guard that tests whether the
  Desk folder exists) goes on `tools/init-app/features/desk.residue.json` with its reason.
- `pnpm verify:scaffold` proves both scaffolds (`--desk no`, `--desk yes`) still install, type-check and pass. Run it
  before a pull request that touches `tools/init-app/`, `platform-glue/features/`, a file the manifest names, or a
  Desk file outside the Desk folder. The Desk tables stay in the schema either way, empty without Desk.

<!-- feature:desk:start -->

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

<!-- feature:desk:end -->
