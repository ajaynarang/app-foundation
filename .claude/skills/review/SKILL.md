---
name: review
description: Use when reviewing any code changes in this NestJS/Prisma + Next.js monorepo — uncommitted changes, branches, PRs, or specific files. Enforces all frontend and backend conventions from the pattern skills, catches architectural violations, and auto-fixes convention issues.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# Code Review

You are the code review guardian for this platform. You enforce all project conventions defined in `app-conventions` (and its references) and `frontend-patterns`, catch architectural violations, and auto-fix convention issues.

Check log lines, metric labels and error reports against `docs/standards/observability.md`.

**Command:** $ARGUMENTS

---

## Phase 1: DETECT — Determine Scope

Parse `$ARGUMENTS` to determine review mode:

| Input         | Mode              | How to get diff                    |
| ------------- | ----------------- | ---------------------------------- |
| _(empty)_     | Uncommitted       | `git diff` + `git diff --cached`   |
| `branch`      | Branch vs default | `git diff <default-branch>...HEAD` |
| `pr <number>` | Pull request      | `gh pr diff <number>`              |
| `file <path>` | Single file       | Read the file directly             |

**Classify every changed file:**

- **Backend** → `apps/backend/`, `packages/appshore/{kernel,db,platform}/`, or `packages/shared-types/`
- **Frontend** → `apps/web/`, `packages/appshore/web-core/`, or `packages/ui/`
- **Both** → changes span both
- **Other** → `apps/mobile/`, `infra/`, `tests/`, config files — apply general checks only (mobile: see `mobile-patterns`)

**Check level:**

- PR mode → **FULL CHECK on ALL files in the PR** (not just changed lines)
- All other modes → **TIERED** (critical checks everywhere, deep checks on changed areas only)

---

## Phase 2: REVIEW — Dispatch Parallel Subagents

Launch **two parallel subagents** (skip the irrelevant one if changes are single-sided):

### Backend Review Agent

Dispatch with `subagent_type: "general-purpose"` and this prompt:

```
You are reviewing backend code for convention compliance.

FIRST: Read <repo-root>/.claude/skills/app-conventions/SKILL.md, then each reference under
<repo-root>/.claude/skills/app-conventions/references/ for the areas the diff touches — these are your authoritative
reference.

MODE: {full|tiered}
FILES TO REVIEW: {file list}
DIFF: {diff content or instructions to get it}

Review every file against the conventions index and those references. For each violation found, report:
- File path and line number
- Which pattern section is violated
- Severity: CRITICAL | CONVENTION | SUGGESTION
- The violating code snippet
- The fix (for CONVENTION: provide exact replacement code)

## CRITICAL violations (always check, all files):
1. snake_case in DTOs or API responses (except Prisma where/data/select/include/orderBy blocks and the wire `name` of a query DTO param, which is snake_case: rule `naming/snake-case-query-keys`)
2. A domain event raised outside the write's transaction (ADR "Outbox and deadlines"; held by architecture/no-direct-emit.spec.ts): `DomainEventService.emit` / `.publish` after a write instead of `emit` inside `OutboxService.transaction((tx, emit) => …)`; a write the event describes done on `this.prisma` instead of `tx`; raw `EventEmitter2.emit(name, new DomainEvent(…))`; an event not in the APP_EVENT_REGISTRY; a new or raised entry in `no-direct-emit.allowlist.json` for anything but a signal with no write behind it, or an entry with no reason
2a. A one-off timer that is not a deadline row (ADR "Outbox and deadlines"; held by `deadlines.integration.spec.ts` and `bulk-ops-handlers.spec.ts`): a delayed BullMQ job, `setTimeout` or a workflow-engine sleep standing in for a timer tied to a write; `DeadlineService.schedule` / `cancel` on `this.prisma` instead of the write's `tx`; a `subjectId` that is an Int primary key; a handler that trusts `payload` instead of re-reading, is not safe to run twice, or does its writes outside `OutboxService.transaction`; a new kind missing from `deadline-kinds.ts`; a new `bulk-ops` job name whose handler is not in the dispatcher's factory
3. `throw new Error()` instead of NestJS exceptions in HTTP paths (BadRequestException, NotFoundException, etc.)
3a. An error body written by hand (`res.status(4xx).json({ message })`) or an exception carrying keys beyond `code`, `detail`, `fieldErrors` — every error leaves through the one envelope (`writeErrorEnvelope`; held by architecture/error-envelope.spec.ts)
3b. A 400 that names no field (use `fieldError()` / `fieldErrors()`, or it is a 401/403/404/409 with a code; rule `errors/controller-400-names-its-field`); error copy that carries an internal id, a storage key or raw exception text (rule `errors/no-internals-in-messages`); a state conflict answered 400 instead of 409 (`invalidState()`, `duplicate()`, `stale()`); `Schema.parse()` at the HTTP boundary instead of `parseWithSchema()`
3c. Success status by route shape (held by architecture/api-contract.spec.ts, rules `status/*`): a POST without `@HttpCode`; a create that is not 201; an action POST (`/:id/verb`) answering 201; queued work not answering 202 with the record to poll; a DELETE that is not 204 or returns a body; an acknowledgement body (`{ success: true }`, `{ message }`, `{ deleted: true }`) from a controller or from the service it returns
3d. Another tenant's record answered 403 instead of 404 (rule `errors/cross-tenant-is-404`); an illegal state transition answered 400 or 403 instead of `invalidState()` (rule `errors/transition-is-409`)
3e. Edge (rules `edge/*`): `@SkipThrottle()` on anything but a health or SSE route (use `@Throttle(GENEROUS_THROTTLE)`), or beside a `@Throttle(...)`; a route behind `ApiKeyAuthGuard` or `OAuthTokenGuard` without `AgentRateLimitGuard` or without `@UseFilters(BearerChallengeFilter)` on its controller
3f. Any entry in `api-contract.baseline.json` (the starter ships it as `{}` and a test holds it empty), or an `api-contract.allowlist.json` entry with no reason, or a `PROVIDER_ROUTES` entry for a route whose format no third party sets, or a `BOUNDED_LISTS` / `BOUNDED_READS` entry for a list or read whose size nothing fixes
3g. Lists (rules `output/*` in architecture/api-contract.spec.ts): a list that can grow that is not a `CursorList { items, nextCursor, total }` (a bare array, `{ data, total }`, `offset` / `page` / `skip`); a cursor whose tiebreak is an Int primary key (except the two API key lists, listed in the ADR "ID boundary"); the scope and the keyset spread into one `where` instead of `AND: [scope, keyset]`; a `findMany` reached from a GET with no `take` and no `BOUNDED_READS` entry; rows loaded to count or sum them; a controller returning a Prisma row (`return this.prisma.…`); a converted list with no spec that walks pages over a fixture (`walkCursorList`), ties included
3h. ID boundary (held by architecture/id-boundary.spec.ts): `ParseIntPipe` on a route param; a DTO property named `id` / `*Id` / `*Ids` typed `number`; a `z.number()` id in a `@app/shared-types` schema or an MCP tool parameter; a service returning a raw row with `id` and numeric foreign keys instead of a `toPublic…` serializer; a new entry or a raised count in `id-boundary.allowlist.json` (it may only shrink), or an entry with no reason
3i. The published contract (held by architecture/swagger-completeness.spec.ts and rules `docs/*`): a route without `@ApiOperation`, a `:param` without `@ApiParam({ name, description })`, a non-public route that returns a body without `@ApiResult(<response schema>, <status>)` (or `@ApiNoContentResponse()` for a 204), or an `@ApiResult` whose status is not the route's; a response schema that is not what the route sends (a Date typed as anything but an ISO string, a nullable column without `.nullable()`, a field the service does not return); a response shape re-typed in the controller file instead of named once in `openapi.responses.ts` from a `@app/shared-types` schema; a DTO field without `@ApiProperty` / `@ApiPropertyOptional`, or `PartialType` from `@nestjs/mapped-types`; a contract change without the regenerated `apps/backend/openapi.json` and `public-openapi.json`; code that picks the served document by reading `NODE_ENV` or `ENV_TYPE` instead of `isProductionEnv()`; a hand list of public routes, or a new credential guard in neither `AGENT_AUTH_GUARDS` nor `NON_CREDENTIAL_GUARDS` (bootstrap/public-openapi.ts); a v1 route retired without `@DeprecatedRoute({ since, sunset })`
3j. Idempotency-Key (ADR "API contract", section 5; held by idempotency.spec.ts and swagger-completeness.spec.ts): a create (201 or 202) whose body shows a secret once (a plaintext key, a client or signing secret, a token or token-bearing link) without `@SkipIdempotency()`; a hand-rolled dedupe of a create by a client-sent key instead of the global interceptor; `@SkipIdempotency()` on a create that shows no secret
3k. Tool pipeline (the `app-conventions` reference `references/ai-tools.md`; held by `mcp-arg-validation.spec.ts`, `mcp-tool.write-parity.spec.ts`, `support-ticket.pipeline.spec.ts`, `intent-digest.spec.ts`, `hitl-challenge.single-use.integration.spec.ts`): a tool method called anywhere but `ToolExecutorService.invoke`, or a chat tool that runs when the pipeline is missing; a hand-kept write list instead of the scope tier; a tool whose REST twin has `@Roles` / `@RequireFeature` without the matching `@RestrictToRoles` / `@RequiresPlanFeature`; a role read from the persona, the JWT or the home tenant instead of the workspace membership; a plan rule copied instead of running `PlanGuard`; a `_`-prefixed field in a tool schema or a server identity param set before the caller's args in a spread; a flag or argument that lets a write skip confirmation; a confirmation digest taken any way but `intentDigest` (over redacted values, a top-level key list, or a second hash function); a token or grant spent by a read followed by an unconditional `update` instead of a conditional `updateMany` on `consumedAt: null`; a chat write that runs without spending a grant for the same conversation, tool and digest, a card built from model prose instead of the recorded tool and args, a resume that confirms without naming the card or confirms it twice, a delegated sub-agent offered a write or `confirm-action`, or a challenge-token path (`consume`, step-up, the context read) that can reach a chat grant row (held by `chat-confirmation.integration.spec.ts`, `confirm-frame.spec.ts`); an external agent's standard write that runs without a person's approval while the workspace's `agentSelfConfirm` is off, a sensitive write approved by anything but the PIN of the person acted for, `argsPreview` stored on a non-approval row, returned for a PIN row, logged, put in an event, or kept after the request is spent or denied, an agent-action decision that is not a conditional update on still-pending, or an approval route an agent credential can reach (held by `agent-actions.service.spec.ts`, `agent-actions.integration.spec.ts`, `invocation-pipeline.service.spec.ts`); `return { error: err.message }` (or any raw exception text) from a tool; a `tools/list` schema not built by `toolInputSchema`; a create tool with no natural key that does not declare `idempotencyKey: idempotencyKeyArg` (or is missing from `IDEMPOTENT_CREATE_TOOLS`), a tool that reads `idempotencyKey` itself or dedupes on its own, a read that declares it, or a replay scoped wider than the workspace and the person acted for (held by `tool-idempotency.spec.ts`, `tool-executor.service.spec.ts`); a tool listed or offered (`tools/list`, a chat toolset, `confirm-action`) without passing `ToolAvailabilityService`, or an availability rule used as a permission check; prompts served by role from the token or persona instead of `ToolAccessPolicyService.actingRole`, a prompt the role may not see answered differently from an unknown one, or a `PROMPT_LIBRARY` entry that breaks the authoring rules (held by `tool-availability.service.spec.ts`, `mcp-server.service.spec.ts`, `prompt-registry.data.spec.ts`, `prompt-registry.service.spec.ts`)
4. Enums imported from '@prisma/client' instead of '@appshore/db', or hand-written enum literals/Zod enums duplicating a Prisma enum
5. Raw AI SDK calls outside the sanctioned paths (Mastra runtime, StructuredOutputService, runStructuredLlmStep)
6. Missing auth guard decorators (@Roles) on controller endpoints
7. Missing tenantId scoping on database queries
8. Secrets or credentials hardcoded in code
9. Missing @ApiTags, @ApiBearerAuth on controllers
10. Cross-domain direct imports (domain A importing domain B internals), or app code imported into packages/appshore/* (layer rule: kernel ← db ← platform ← apps)
11. A new @Processor class added to an existing queue (one dispatcher per queue — add a QueueJobHandler instead)
11a. A `bulk-ops` job name whose handler is not injected into and returned by the factory in `bulk-ops-queue.module.ts`, or missing from the map in architecture/bulk-ops-handlers.spec.ts (an unwired handler is a silent no-op)
11b. An event consumer (an `@OnEvent` listener, a durable-path step, a job it enqueues) that is not safe to run twice for one event id: a write or a job id not keyed on `event.id`, an insert where an upsert belongs. Delivery is at least once; architecture-level proof is platform-glue/events/__tests__/double-delivery.spec.ts
11c. Product vocabulary in the kernel (held by architecture/foundation-vocabulary.spec.ts): a queue, job name, job label, job category or manual type added to `@appshore/kernel` `queue.constants.ts` / `job.types.ts` for an app job; it belongs in `platform-glue/queue/job-names.ts`. A notification type added to `PLATFORM_NOTIFICATION_TYPES` for an app use, or a Prisma enum reintroduced for it; app types go in `platform-glue/notifications/notification-types.ts` with a policy in `NOTIFICATION_POLICIES`
11d. The queue role switch read or set anywhere but `main.ts` (`applyQueueProcessingMode()`) and Terraform's `api_queue_processors_enabled`: `worker.ts` reading `QUEUE_PROCESSORS_ENABLED`, the key copied into Doppler or an env example as a default, or `api_queue_processors_enabled = false` with no worker task

## DEEP checks (changed files only in tiered mode, all files in full mode):
12. DTO validation: class-validator decorators, @ApiProperty, @Transform for optional strings, cents for money
12a. Query strings: one `@Query() query: XQueryDto` built from the kernel query-DTO kit (snake_case wire names, `q` for search, `containsText()` for LIKE); no `@Query('x')` parameter (rule `input/query-is-a-dto`) and no `parseInt`/`parseFloat`/`Number()` or `Schema.parse()` in a controller (rules `input/no-number-parse-in-controllers`, `input/no-schema-parse-in-controllers`)
12b. Bodies: `@Body() dto: XDto`, a class imported as a value; never `@Body('x')`, an inline type, an interface, `Record<…>`, an array or an `import type` class (rule `input/body-is-a-dto-class`). A body a standard defines is a `@ProtocolWireDto`
13. Cache patterns: correct TTL tier constant, buildKey usage, event-based invalidation registered
14. Queue patterns: job names from *_JOB_NAMES constants, bullJobIdFromDbId for custom job IDs, correlationId forwarded
15. Service structure: Logger injection, constructor pattern, tenantId as first param
16. Error messages: user-friendly, no raw technical errors, Prisma codes, or internal IDs exposed
17. Prisma queries: N+1 detection (findMany in loop), missing select/include optimization, find-then-create instead of upsert
18. Domain event naming: app.<aggregate>.<past-tense-action> format, registered in APP_EVENT_REGISTRY
19. Controller URL naming: kebab-case paths, snake_case URL params (rule `naming/snake-case-url-params`), one param name per collection (`naming/one-param-name-per-collection`), every `@Param('x')` matching a `:x` in its route (`naming/param-matches-route`), RESTful conventions
20. Module registration: proper imports/exports in the parent domain module
21. BaseTenantController extension for tenant-scoped controllers
22. State transitions: dedicated method with a whitelisted from→to map (no free-form status updates)
23. A growing list is a cursor list (`clampCursorLimit`, `keysetWhere`, `buildCursorPage`); no unbounded list queries

## CODE QUALITY checks (always, all files — see the `app-conventions` reference `references/code-quality.md`):
24. Method length > 50 lines → CONVENTION: split into private helpers with intention-revealing names
25. File length > 500 lines → CONVENTION: split along SRP lines
26. Class/file names ending in Manager/Helper/Util/Handler without a sharper noun → CONVENTION: rename
27. `.catch(() => {})` empty catch without explanatory comment → CONVENTION: log or rethrow
28. Commented-out code blocks → CONVENTION: delete (git has history)
29. Comments that restate what the code does (no WHY) → CONVENTION: delete the comment
30. `any` type without justification → CONVENTION: type it properly
31. Copy-pasted block appearing for the 3rd time → CONVENTION: extract a helper/service
32. Deep ternary `a ? b ? c : d : e` → CONVENTION: refactor to if/switch
33. Dead parameters / unused imports / unused variables → CRITICAL: delete
34. Speculative generality (generics/flags/config with zero callers today) → CONVENTION: remove (YAGNI)
35. Circular dependency via forwardRef on a new boundary → SUGGESTION: propose the third concept that breaks the cycle

Report as a structured JSON array:
[{ "file": "...", "line": N, "section": "...", "severity": "...", "code": "...", "fix": "...", "description": "..." }]
```

### Frontend Review Agent

Dispatch with `subagent_type: "general-purpose"` and this prompt:

```
You are reviewing frontend code for convention compliance.

FIRST: Read the skill at <repo-root>/.claude/skills/frontend-patterns/SKILL.md — this is your authoritative reference.

MODE: {full|tiered}
FILES TO REVIEW: {file list}
DIFF: {diff content or instructions to get it}

Review every file against the frontend patterns skill. For each violation found, report:
- File path and line number
- Which pattern section is violated
- Severity: CRITICAL | CONVENTION | SUGGESTION
- The violating code snippet
- The fix (for CONVENTION: provide exact replacement code)

## CRITICAL violations (always check, all files):
1. Plain HTML elements instead of @app/ui shadcn components: <button>, <input>, <select>, <table>, <label>, <textarea>. A shadcn component is imported from `@app/ui/components/ui/*` only: no copy under `apps/web/src/shared/components/ui/` and no import through `@/shared/components/ui/` (single-component-set.test.ts)
2. A raw Tailwind palette class (`bg-gray-50`, `text-red-500`, `border-yellow-600`, even with a `dark:` pair) or a hex class (`bg-[#…]`) anywhere in `apps/web/src`, `packages/ui/src` or web-core: a surface wears a theme token (`bg-background`, `bg-muted/50`, `border-border`), a status a tone. Tinted text wears the `-text` token (`text-caution-text`), never the fill hue (`text-caution`) (ui-grammar-guard.test.ts)
3. Missing mutation toasts: every useMutation must have both showSuccess() and showError() (or a verified global fallback)
4. Loading states using Loader2/spinner/null instead of <Skeleton> or a shaped `PageLoadingSkeleton`
5. Manual Loader2 in buttons instead of the loading={isPending} prop
6. Local entity type definitions instead of importing from @app/shared-types
7. Dialog used for forms with 4+ fields (should be Sheet/FormSheet)
8. Direct Zustand for server state (should be TanStack Query)
9. Missing 'use client' directive on components using hooks
10. Hardcoded values that exist in shared-types or centralized constants (query keys, storage keys, enum values)
10a. A date written with `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString`, `formatDistanceToNow` or a hand-rolled "5m ago" helper: dates go through `useFormatters()` (the user's format and timezone) and relative times through `RelativeTime` (eslint `no-restricted-syntax`; ui-grammar-guard.test.ts)
10b. A list that reads a query with no `ListErrorState` branch, or an `Alert` used as an empty or error state: a failed fetch must never read as empty (ui-grammar-guard.test.ts)

## DEEP checks (changed files only in tiered mode, all files in full mode):
11. Sheet patterns: FormSheet usage, onInteractOutside for edit mode, sticky footer action placement, destructive actions behind AlertDialog
12. Form patterns: simple useState vs react-hook-form+Zod threshold
13. Query key conventions: centralized in query-keys.ts, distinct 'list'/'detail' segments
14. SSE invalidation: new events registered in the invalidation map (+ backend registry/bridge)
15. State management: Zustand for UI-only, TanStack Query for server, useState for component
16. Prefetch patterns: prefetchQuery for list-to-detail transitions
17. Responsive classes: mobile-first, 375/768/1440 breakpoints
18. API layer: object namespace pattern (entityApi.method()), no direct fetch calls in components
19. Query tier: QUERY_TIERS used instead of hardcoded staleTime/refetchInterval
20. Error handling: extractErrorMessage usage, error boundaries per route segment; a raw fetch reads `detail` (never `message`) from an error body, and branches on `code` via extractErrorCode
21. Page chrome: PageHeader + PageToolbar + ListFilterRow from @/shared/components/page-chrome; title AND subtitle present; no hand-rolled headers. Every settings and admin page renders `PageHeader`, and a section heading is `PageSection`, never a raw h1/h2; a feature folder those pages render is listed in `SETTINGS_ADMIN_DIRS` of ui-grammar-guard.test.ts. A new growing list uses useListParams + useCursorList and renders ListErrorState and ListFooter. A status maps to a tone (StatusVariant) and renders StatusBadge, never a colour class; tinted text wears a `-text` token. Row actions go through RowActions (no raw `<Button>` in a `<TableCell>` or `<li>`; a destructive item confirms first), a status map is added to `STATUS_MAPS` in ui-grammar-guard.test.ts so its labels keep one tone app-wide, a control hidden until hover also shows on focus and touch, and no raw fetch hand-builds a bearer token. `@app/ui` imports no `@appshore/*`, `@/`, `next` or app code (foundation-boundaries.spec.ts)
22. Button variants: correct variant for context (default/destructive/outline/ghost)
23. Toasts imported from @app/ui, never raw toast()

## CODE QUALITY checks (always, all files — see Section 0 of the frontend-patterns skill):
24. Component > 300 lines → CONVENTION: split into subcomponents (header/body/actions regions)
25. Custom hook > 50 lines → CONVENTION: split — one hook = one cohesive surface
26. JSX render block > 40 lines → CONVENTION: extract local subcomponents
27. `useEffect` that sets state derivable from existing props/state → CRITICAL: derive with useMemo / compute inline
28. `key={index}` on a dynamic list → CRITICAL: use stable entity ID
29. State mutation before setState (`arr.push(x); setArr(arr)`) → CRITICAL: `setArr([...arr, x])`
30. Icon-only Button without `aria-label` → CONVENTION: add label
31. Form field without `<Label>` → CONVENTION: add Label component
32. Missing dark: variant on color utility → CONVENTION: add dark variant or use semantic token
33. Inline `style={{...}}` with more than one dynamic value → CONVENTION: Tailwind classes or CSS variable
34. Component/hook names starting with Wrapper, Container, Inner, Data, Info without sharper noun → CONVENTION: rename
35. Boolean prop/state missing is/has/should prefix when ambiguous → CONVENTION: rename
36. `any` in a prop type → CONVENTION: type it (or `unknown` with narrowing)
37. Copy-pasted JSX block (3rd occurrence) → CONVENTION: extract component
38. Whole useMutation/useQuery result object in a useEffect dep array → CRITICAL: depend on stable fields
39. Comment restating JSX content → CONVENTION: delete

Report as a structured JSON array:
[{ "file": "...", "line": N, "section": "...", "severity": "...", "code": "...", "fix": "...", "description": "..." }]
```

---

## Phase 3: ACT — Merge Results & Execute

### 3a. Collect Results

Merge both agents' JSON results into a single list. Deduplicate any overlapping findings (e.g., shared-types issues caught by both).

### 3b. Auto-Fix CONVENTION Violations

For each item with severity `CONVENTION`, apply the fix automatically using the Edit tool:

**Common auto-fixes:**

- `bg-white` → `bg-background` (or the appropriate semantic token / paired dark variant)
- `text-gray-900` → `text-foreground`; `text-gray-600` → `text-muted-foreground`
- `border-gray-200` → `border-border`
- `hover:bg-gray-100` → `hover:bg-gray-100 dark:hover:bg-gray-800`
- `throw new Error('...')` → the appropriate NestJS exception
- Enum import from `@prisma/client` → `@appshore/db`
- camelCase fixes in API response fields

**Rules for auto-fix:**

- Only fix when the replacement is unambiguous
- If the fix could change behavior (not just style), report as CRITICAL instead
- After all fixes, run `pnpm lint` (scoped to the changed packages) to verify no breakage

### 3c. Generate Report

Output the review report in this exact format:

```markdown
# Code Review Report

## Summary

| Metric                          | Count                                        |
| ------------------------------- | -------------------------------------------- |
| Files reviewed                  | {N} ({backend} backend, {frontend} frontend) |
| Mode                            | {uncommitted / branch / PR #N / file}        |
| Critical issues                 | {N}                                          |
| Convention fixes (auto-applied) | {N}                                          |
| Suggestions                     | {N}                                          |

## Critical Issues — Must Fix

{For each: number, title, file:line, description, violating code block, what to do}

## Auto-Fixed — Convention Violations

{For each: checkmark, what was fixed, file:line, before → after}

## Suggestions

{For each: number, description, file:line, recommendation}

## Verdict

{One of:}

- BLOCKED — {N} critical issues must be resolved before merge
- CLEAN — No violations found. Ready to merge.
- READY — {N} convention issues auto-fixed, {N} suggestions noted. No blockers.
```

---

## Rules

1. **Never skip the pattern skills** — always read `app-conventions` (with the references the diff touches) and `frontend-patterns` fresh (they evolve)
2. **PR mode is exhaustive** — check ALL files, not just changed lines
3. **Auto-fix only unambiguous conventions** — when in doubt, report instead of fixing
4. **Verify after auto-fix** — run linting to confirm fixes don't break anything
5. **Be specific** — every finding must include file path, line number, and code snippet
6. **No false positives** — if you're unsure whether something is a violation, mark it as SUGGESTION not CRITICAL
7. **Respect the Prisma exceptions** — snake_case IS correct inside Prisma where/data/select/include/orderBy blocks and `@Query('snake_case')` decorator arguments
8. **Check the anti-patterns lists** — both pattern skills have explicit "NEVER do these" sections; check all of them
