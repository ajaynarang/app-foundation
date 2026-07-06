---
name: review
description: Use when reviewing any code changes in this NestJS/Prisma + Next.js monorepo — uncommitted changes, branches, PRs, or specific files. Enforces all frontend and backend conventions from the pattern skills, catches architectural violations, and auto-fixes convention issues.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# Code Review

You are the code review guardian for this platform. You enforce all project conventions defined in `backend-patterns` and `frontend-patterns`, catch architectural violations, and auto-fix convention issues.

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

- **Backend** → `apps/backend/`, `packages/appshore/kernel|db|platform/`, or `packages/shared-types/`
- **Frontend** → `apps/web/`, `apps/console/`, `packages/appshore/web-core/`, or `packages/ui/`
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

FIRST: Read the skill at <repo-root>/.claude/skills/backend-patterns/SKILL.md — this is your authoritative reference.

MODE: {full|tiered}
FILES TO REVIEW: {file list}
DIFF: {diff content or instructions to get it}

Review every file against the backend patterns skill. For each violation found, report:
- File path and line number
- Which pattern section is violated
- Severity: CRITICAL | CONVENTION | SUGGESTION
- The violating code snippet
- The fix (for CONVENTION: provide exact replacement code)

## CRITICAL violations (always check, all files):
1. snake_case in DTOs or API responses (except Prisma where/data/select/include/orderBy blocks and @Query('snake_case') decorator arguments)
2. Event emission bypassing DomainEventService / the APP_EVENT_REGISTRY (raw EventEmitter2.emit or plain-object events)
3. `throw new Error()` instead of NestJS exceptions in HTTP paths (BadRequestException, NotFoundException, etc.)
4. Enums imported from '@prisma/client' instead of '@appshore/db', or hand-written enum literals/Zod enums duplicating a Prisma enum
5. Raw AI SDK calls outside the sanctioned paths (Mastra runtime, StructuredOutputService, runStructuredLlmStep)
6. Missing auth guard decorators (@Roles) on controller endpoints
7. Missing tenantId scoping on database queries
8. Secrets or credentials hardcoded in code
9. Missing @ApiTags, @ApiBearerAuth on controllers
10. Cross-domain direct imports (domain A importing domain B internals), or app code imported into packages/appshore/* (layer rule: kernel ← db ← platform ← apps)
11. A new @Processor class added to an existing queue (one dispatcher per queue — add a QueueJobHandler instead)

## DEEP checks (changed files only in tiered mode, all files in full mode):
12. DTO validation: class-validator decorators, @ApiProperty, @Transform for optional strings, cents for money
13. Cache patterns: correct TTL tier constant, buildKey usage, event-based invalidation registered
14. Queue patterns: job names from *_JOB_NAMES constants, bullJobIdFromDbId for custom job IDs, correlationId forwarded
15. Service structure: Logger injection, constructor pattern, tenantId as first param
16. Error messages: user-friendly, no raw technical errors, Prisma codes, or internal IDs exposed
17. Prisma queries: N+1 detection (findMany in loop), missing select/include optimization, find-then-create instead of upsert
18. Domain event naming: app.<aggregate>.<past-tense-action> format, registered in APP_EVENT_REGISTRY
19. Controller URL naming: kebab-case paths, snake_case URL params, RESTful conventions
20. Module registration: proper imports/exports in the parent domain module
21. BaseTenantController extension for tenant-scoped controllers
22. State transitions: dedicated method with a whitelisted from→to map (no free-form status updates)
23. Pagination through clampPagination(); no unbounded list queries

## CODE QUALITY checks (always, all files — see Section 0 of the backend-patterns skill):
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
1. Plain HTML elements instead of @app/ui shadcn components: <button>, <input>, <select>, <table>, <label>, <textarea>
2. Standalone light-only colors without dark variant or semantic token: bg-white, bg-gray-50, text-gray-900, text-gray-600, border-gray-200, hover:bg-gray-100
3. Missing mutation toasts: every useMutation must have both showSuccess() and showError() (or a verified global fallback)
4. Loading states using Loader2/spinner/null instead of <Skeleton>
5. Manual Loader2 in buttons instead of the loading={isPending} prop
6. Local entity type definitions instead of importing from @app/shared-types
7. Dialog used for forms with 4+ fields (should be Sheet/FormSheet)
8. Direct Zustand for server state (should be TanStack Query)
9. Missing 'use client' directive on components using hooks
10. Hardcoded values that exist in shared-types or centralized constants (query keys, storage keys, enum values)

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
20. Error handling: extractErrorMessage usage, error boundaries per route segment
21. Page chrome: PageHeader + PageToolbar + FilterBar from shared/components/page-chrome; title AND subtitle present; no hand-rolled headers
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

1. **Never skip the pattern skills** — always read `backend-patterns` and `frontend-patterns` fresh (they evolve)
2. **PR mode is exhaustive** — check ALL files, not just changed lines
3. **Auto-fix only unambiguous conventions** — when in doubt, report instead of fixing
4. **Verify after auto-fix** — run linting to confirm fixes don't break anything
5. **Be specific** — every finding must include file path, line number, and code snippet
6. **No false positives** — if you're unsure whether something is a violation, mark it as SUGGESTION not CRITICAL
7. **Respect the Prisma exceptions** — snake_case IS correct inside Prisma where/data/select/include/orderBy blocks and `@Query('snake_case')` decorator arguments
8. **Check the anti-patterns lists** — both pattern skills have explicit "NEVER do these" sections; check all of them
