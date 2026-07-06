---
name: frontend-patterns
description: Use when implementing, modifying, reviewing, or planning any frontend feature in this Next.js 15 web application (apps/web, @appshore/web-core, @app/ui) — pages, components, hooks, API layer, forms, sheets, tables, state management, real-time updates, styling.
---

# Frontend Patterns

Authoritative reference for all frontend conventions. Every new feature, page, or component MUST follow these patterns.

Examples below use a neutral demo domain (projects / tasks). Substitute your own entities — the patterns are what matter.

---

## 0. Code Quality Principles (read first — override defaults, apply to ALL frontend code)

These principles take precedence over convenience, speed, or mimicking existing code that violates them.

### SOLID (adapted for React)

- **Single Responsibility** — one component, one purpose. If a component renders a list AND manages filters AND handles submission, split into `<Filters>`, `<List>`, `<SubmitBar>` composed by a lean parent.
- **Open/Closed** — extend via composition (children, props, slots) not by editing the component every time a variant is added. Pass behavior through props/callbacks, don't grow internal `if (variant === 'x')`.
- **Liskov Substitution** — compound primitives (e.g. `<Button variant="ghost">`) should honor the same prop contract as `<Button>`. Don't quietly drop `onClick` or `disabled` semantics in variants.
- **Interface Segregation** — props interfaces stay narrow. A `<TaskRow>` that takes an entire `Task` object when it only needs `{ id, name, status }` couples consumers to shape they don't use.
- **Dependency Inversion** — components depend on props (contracts), not on imported singletons. Data access goes through hooks (`useProjects()`), not direct `fetch()` inside the component.

### KISS

- The simplest component that works. No abstraction until a second caller proves it's needed.
- Prefer plain JSX over dynamic render trees. A `{items.map(...)}` is always clearer than `<DynamicRenderer config={...}/>`.
- No clever hooks. If `useSomething` does three unrelated things, it's a god-hook — split it.

### DRY

- Extract a component when the same JSX + behavior appears **three times**. Two is coincidence.
- Extract a hook when the same state+effect+mutation pattern appears three times.
- Don't over-extract. A `<LoadingSpinner>` wrapping a single `<Skeleton>` is noise.

### YAGNI

- No prop "just in case." If nothing passes `variant="xyz"` today, don't add support.
- No feature flags for UI that isn't shipping now.

### Component Length

- **Target ≤ 150 lines per component file** including JSX. Ceiling ≈ 300.
- If a component grows past that, extract subcomponents for distinct visual regions (header, body, actions).
- Keep each render function ≤ 40 lines of JSX. Extract chunks into local components.

### Hook Length

- **Target ≤ 50 lines per custom hook.** If it's longer, it's probably doing multiple things — split.
- A single `useXxx` should return one cohesive surface (data + status + actions for one resource).

### File Structure

- One component per file. File name matches the default export: `task-row.tsx` exports `TaskRow`.
- Co-locate tightly-coupled subcomponents in the same folder, not the same file:
  ```
  tasks-table/
    tasks-table.tsx           (main)
    task-row.tsx              (only used by tasks-table)
    tasks-table-toolbar.tsx
    tasks-table.utils.ts
  ```

### Naming

- **Components**: `PascalCase`, nouns or noun phrases. `TaskRow`, `ProjectAssignmentSheet`. Never `DoTheThing`.
- **Hooks**: `camelCase` starting with `use`. `useProjectList`, `useTaskAssignment`. The verb in the name reflects what it returns, not how it implements it.
- **Files**: `kebab-case.tsx` for components, `kebab-case.ts` for utils/types, `use-xxx.ts` for hooks.
- **Props interfaces**: `<ComponentName>Props`. Always exported when the component is exported.
- **Event handlers**: `handleXxx` inside the component, `onXxx` on props. `handleSubmit` locally, `onSubmit` in the prop type.
- **Boolean props/state**: `isLoading`, `hasError`, `shouldShowBanner`, `canEdit`. Never `loading: boolean` without the `is-` prefix (avoids confusion with data).
- **Avoid**: `Wrapper`, `Container`, `Inner` without a sharper noun. `Component` as a suffix. `data` / `info` as state variable names when the meaning is specific.

### React Specifics

- **Derive, don't sync.** If a piece of state is computable from props or other state, compute it (`useMemo` if expensive). Don't `useEffect(() => setDerived(...))`.
- **Keys in lists must be stable IDs**, not array indexes. Never `key={index}` unless the list is immutable and order-fixed.
- **`useEffect` is a last resort.** First ask: can this be an event handler? A derived value? A `useMemo`? Then an effect.
- **Never mutate state.** `arr.push(x)` then `setArr(arr)` is a bug in React. Always `setArr([...arr, x])`.
- **`useCallback` / `useMemo` are appropriate for three things:**
  1. **Derived state feeds a `useEffect` dep array** — without `useMemo`, the new identity each render fires the effect every time.
  2. **You're handing the value to a memoized child** (`React.memo`, virtualized list item renderers) where prop identity matters.
  3. **The computation is genuinely expensive** (sorting/filtering >1k items, building maps).
     Don't memoize trivial scalars or one-off JSX. But don't apologize for memoizing derived business state — it's load-bearing, not premature.
- **`useRef` for non-reactive values.** File inputs, debouncers, "did we already fire this" flags, observers, previous-value comparisons live in a ref. Never in `useState` — they cause needless re-renders.

### Accessibility (non-negotiable)

- Every interactive element is keyboard-reachable and has visible focus styles.
- Every form control has a `<Label>` (shadcn `<Label>` component).
- Every icon-only button has `aria-label`.
- Color is never the only signal (status uses icon + color + text).
- Minimum touch target 44×44px.

### Styling

- Tailwind utility classes in JSX, no custom CSS files for components.
- Theme tokens every change: `bg-background`, `text-foreground`, `border-border`, etc. Standalone `bg-white` / `text-gray-900` is a bug (see §12).
- Use semantic tokens (`primary`, `muted`, `destructive`), not raw colors.
- Responsive: mobile-first, `sm:` / `md:` / `lg:` breakpoints. Test 375px, 768px, 1440px.

### State Management

- **Server state**: TanStack Query. Don't mirror server data into Zustand or component state.
- **Global UI state** (sidebar open, theme): Zustand store.
- **Local UI state** (form inputs, hover, focus): `useState`.
- **URL state** (active tab, filter params): `searchParams`, not component state.

### Error Handling

- Every mutation has both success AND error toasts (`showSuccess` / `showError` from `@app/ui`).
- Every async boundary has a Skeleton OR Suspense fallback, not `null`, not a spinner-in-empty-layout.
- Never swallow errors silently. Log or toast.

### Testing

- Playwright E2E (the `@app/qa` suite in `tests/`) for golden-path user flows.
- The web app's own gates are type-check + build + browser verification.
- Test behavior (what the user sees/does), not implementation (internal state names).

### What to call out in review

- Component > 300 lines → **split**.
- Hook > 50 lines → **split**.
- `useEffect` that sets state derivable from existing props/state → **derive with useMemo instead**.
- `key={index}` on a dynamic list → **use stable ID**.
- Inline styles (`style={{...}}`) with more than a single dynamic value → **Tailwind classes or CSS variable**.
- Standalone light-only color class → **use theme token or add dark variant**.
- Mutation without error toast → **add**.
- `any` in a prop type → **type it** (or `unknown` with a narrowing check).
- Icon-only button without `aria-label` → **add**.
- `data`, `info`, `obj` as component state names → **rename**.

---

## Architecture Overview

```
apps/web/src/
  app/                    # Next.js App Router pages
  features/               # Feature modules (domain-driven) — YOUR features go here
    auth/  billing/  ai/  admin/  webhooks/
    platform/             # settings, plans, feature-flags, api-keys, workspaces, onboarding, …
    <your-feature>/       # api.ts, hooks/, components/, index.ts
  shared/                 # App-level shared code
    components/           # page-chrome/, layout/, common/, ui/, command-palette/
    config/  hooks/  providers/  utils/
  middleware.ts           # Route protection + tenant resolution

packages/appshore/web-core/src/     # @appshore/web-core — the web foundation
  auth/session-bridge.ts            # session store bridge
  shared/
    lib/api/              # apiClient — authenticated fetch with JWT auto-refresh
    lib/error-utils.ts    # extractErrorMessage, extractFieldErrors, extractErrorCode
    lib/toast.ts          # re-export — use @app/ui directly in new code
    constants/query-keys.ts     # centralized TanStack Query keys
    constants/storage-keys.ts   # localStorage key registry
    config/query-tiers.ts       # QUERY_TIERS (OPERATIONAL / STATIC / ACTIVE_POLL)
    realtime/             # SSE provider, bus, invalidation-map
    hooks/  stores/

packages/ui/              # @app/ui — shadcn components, cn(), toasts, FormSheet, tailwind preset
packages/shared-types/    # @app/shared-types — Zod schemas + generated Prisma enum mirror
```

Each feature directory contains: `api.ts`, `hooks/`, `components/`, and optionally `types.ts` / `constants.ts`. `@appshore/web-core` is source-consumed via tsconfig paths (`@appshore/web-core/shared/...`).

---

## 1. Types (Shared Types — Single Source of Truth)

**NEVER define entity types locally.** Re-export from `@app/shared-types`:

```typescript
// features/projects/types.ts
export type { Project, ProjectStatus, Task, CreateProjectInput, UpdateProjectInput } from '@app/shared-types';
```

Frontend-only types (form state, component props) are defined locally in the component or `types.ts`.

**Enum values (NON-NEGOTIABLE):** filters, DTO payloads, and select values send the **canonical UPPERCASE Prisma enum** from `@app/shared-types` (the generated mirror) — never a lowercase or hand-narrowed string literal. Never hand-write `'UPPER_LITERAL'` next to an enum-typed field.

---

## 2. API Layer

**Central client:** `apiClient` from `@appshore/web-core/shared/lib/api` — wraps `fetch` with JWT auth and auto-refresh.

```typescript
// features/projects/api.ts
import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { Project, CreateProjectInput } from './types';

export const projectsApi = {
  list: (params?: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return apiClient<Project[]>(`/projects${query ? `?${query}` : ''}`);
  },

  getById: (projectId: string) => apiClient<Project>(`/projects/${projectId}`),

  create: (data: CreateProjectInput) => apiClient<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),

  updateStatus: (projectId: string, status: string) =>
    apiClient<Project>(`/projects/${projectId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
```

**Rules:**

- Object namespace pattern: `entityApi.method()` (not classes)
- Use `URLSearchParams` for query strings
- Type the return value: `apiClient<Entity[]>(...)`
- For blob downloads (PDFs): use raw `fetch()` with auth headers, not `apiClient`
- `credentials: 'include'` for cookie-based endpoints

---

## 3. TanStack Query — Query Hooks

**Centralized query keys** (`@appshore/web-core/shared/constants/query-keys.ts` — add your domain namespaces alongside the platform ones):

```typescript
export const queryKeys = {
  projects: {
    root: ['projects'] as const,
    list: (params: Record<string, unknown>) => ['projects', 'list', params] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
    tasks: (id: string) => ['projects', 'detail', id, 'tasks'] as const,
  },
  // ... every domain
};
```

**List/detail collision rule (NON-NEGOTIABLE):** list and detail keys MUST have distinct segments (`'list'` / `'detail'`). With the naive shape `['x', params]` + `['x', id]`, TanStack's hash treats `undefined` (list with no params) and `null` (detail sheet closed) as the SAME key — list data leaks into the detail query and crashes. Always namespace.

**Query hook pattern:**

```typescript
export function useProjects(params?: ProjectListFilters) {
  return useQuery({
    queryKey: queryKeys.projects.list(params as Record<string, unknown>),
    queryFn: () => projectsApi.list(params),
  });
}

export function useProjectById(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => projectsApi.getById(projectId),
    enabled: !!projectId, // Conditional fetch
  });
}
```

**Query tiers** (`@appshore/web-core/shared/config/query-tiers.ts`):

| Tier           | Behavior                     | Use For                             |
| -------------- | ---------------------------- | ----------------------------------- |
| Default (none) | global staleTime             | SSE-covered data                    |
| `OPERATIONAL`  | `refetchOnWindowFocus: true` | Dashboards needing instant catch-up |
| `STATIC`       | long staleTime               | Reference data, plans, config       |
| `ACTIVE_POLL`  | short staleTime + interval   | No SSE coverage (job status, etc.)  |

```typescript
export function useJobStats() {
  return useQuery({
    queryKey: queryKeys.jobs.stats,
    queryFn: () => jobsApi.stats(),
    ...QUERY_TIERS.OPERATIONAL,
  });
}
```

**NEVER hardcode `staleTime` or `refetchInterval`** — use `QUERY_TIERS`.

**Conditional fetching (`enabled`)** — three concrete uses:

```typescript
// 1. Detail query waits for an ID
useQuery({ queryKey: queryKeys.projects.detail(projectId), queryFn: ..., enabled: !!projectId });

// 2. Tab-gated query — opt-in by the consumer (defaults disabled)
export function useBoardTasks({ enabled = false } = {}) {
  return useQuery({ queryKey: ..., queryFn: ..., enabled });
}
// in the page:
const board = useBoardTasks({ enabled: activeTab === 'board' });

// 3. Permission-gated query
useQuery({ queryKey: ..., queryFn: ..., enabled: hasFeature('reports') });
```

The "default disabled" pattern is important for tabbed pages — it prevents fetching board data when the user lands on the history tab. Tabs flip `enabled` themselves; the hook stays dumb.

**Other useful options on multi-page lists:**

- `placeholderData: keepPreviousData` (TanStack v5) — keeps the previous page visible during pagination instead of flashing a skeleton.
- `select: (data) => ...` — derive a smaller shape from the response without re-creating it on every render.

---

## 4. TanStack Query — Mutation Hooks

**Standard mutation (MANDATORY toast pattern):**

```typescript
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectInput) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.root });
      showSuccess('Project created'); // NEVER skip
    },
    onError: (error: Error) => {
      showError('Failed to create project', extractErrorMessage(error)); // NEVER skip
    },
  });
}
```

**Optimistic update mutation (low-risk status toggles):**

```typescript
export function useAcknowledgeNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.acknowledge(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications.root });
      const prev = qc.getQueriesData({ queryKey: queryKeys.notifications.root });
      qc.setQueriesData({ queryKey: queryKeys.notifications.root }, (old: any) =>
        old?.map?.((item: any) => (item.id === id ? { ...item, isRead: true } : item)),
      );
      return { prev };
    },
    onSuccess: () => showSuccess('Notification acknowledged'),
    onError: (error: Error, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
      showError('Failed to acknowledge', extractErrorMessage(error));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.root });
    },
  });
}
```

**Rules:**

- Every mutation MUST have both `showSuccess()` and `showError()` (import from `@app/ui`)
- Use optimistic updates only for low-risk status toggles (acknowledge, dismiss, pin)
- Batch mutations: simpler pattern (no optimistic update, just `onSuccess` invalidation)
- **NEVER put a whole `useMutation()`/`useQuery()` result object in a `useEffect` dependency array** — the result is a new reference every render, so the effect loops infinitely. Depend on the stable methods instead: `mutation.reset`, `mutation.mutate`, or specific primitive fields.

---

## 5. SSE Real-Time Updates

**How it works:**

1. The SSE provider (`@appshore/web-core/shared/realtime/`) connects to the backend SSE stream
2. Backend emits domain events → SSE bridge → broadcasts to tenant (or unicasts to users)
3. Frontend receives SSE event → invalidates matching TanStack Query keys

**SSE invalidation map** (`@appshore/web-core/shared/realtime/invalidation-map.ts`):

```typescript
export const SSE_INVALIDATION_MAP = {
  [SSE_EVENTS.PROJECT_CREATED]: [['projects'], ['dashboard']],
  [SSE_EVENTS.NOTIFICATION_NEW]: [['notifications']],
  // ...
};
```

**When adding SSE for a new feature (5 touchpoints, same list as backend §8):**

1. Backend: add the event to `APP_EVENT_REGISTRY` (`apps/backend/src/platform-glue/events/event-registry.ts`)
2. Backend: add the bridge mapping in `platform-glue/sse/domain-event-sse-bridge.service.ts`
3. Shared: add the SSE event type in `packages/shared-types/src/infrastructure/sse-events.ts`
4. Frontend: add the mapping in `invalidation-map.ts`

**Custom SSE handlers (multi-key invalidation):** the static map handles most events. Write a custom handler (via `useSSEEvent`) when one event must invalidate 3+ unrelated query trees, when you need payload data to pick keys, or when you need side effects (sound, browser notification, optimistic patch). Otherwise, prefer the map — it's the source of truth and easier to audit.

---

## 5.1 URL State Lifecycle (Deep Links + Cleanup)

Pages that can be linked into a specific dialog/sheet/tab use URL search params, not just component state. The lifecycle has three steps — **read → act → clean**.

```typescript
const searchParams = useSearchParams();
const openParam = searchParams.get('open'); // e.g. ?open=PRJ-2026-001

useEffect(() => {
  if (!openParam) return;
  setSelectedProjectId(openParam);
  setDetailOpen(true);
  // Clean the URL so refresh doesn't re-trigger and back-button works as expected
  const url = new URL(window.location.href);
  url.searchParams.delete('open');
  window.history.replaceState(null, '', url.toString());
}, [openParam]);
```

**Use URL state for:** active tab (`?tab=history`), deep links into a detail sheet (`?open=<id>`), shareable filters (`?status=OPEN&assignee=42`), pagination offset when deep-linkability matters.

**Use `useState` for:** sheet open/close NOT triggered by a link, form input values, hover/focus/UI affordances.

**Rules:**

- Always clean up after consuming a one-shot param (`?open=`, `?action=`) so refreshing the page doesn't re-fire the side effect.
- Never read `searchParams` directly inside `useQuery`'s `queryKey` without normalizing — derive a memoized object first or you'll thrash the cache on every render.

---

## 6. State Management

**Zustand:** UI-only state (auth session, preferences, layout choices)

```typescript
// Persisted store (localStorage)
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      signIn: (data) => set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true }),
      signOut: () => set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    { name: 'auth-storage', partialize: (state) => ({ user: state.user, accessToken: state.accessToken }) },
  ),
);
```

**Division of responsibility:**

- **TanStack Query** — ALL server state
- **Zustand** — UI state only (auth tokens, preferences, layout choices)
- **useState** — Component-local state (form data, open/close, filters)

---

## 7. Form Patterns

**Two approaches:**

**Simple forms (most common):** `useState` with manual validation

```typescript
const [form, setForm] = useState<FormState>({ name: '', kind: 'INTERNAL' });
const [error, setError] = useState<string | null>(null);

const handleSubmit = useCallback(() => {
  if (!form.name.trim()) {
    setError('Name is required');
    return;
  }
  setError(null);
  createMutation.mutate(form, {
    onSuccess: () => resetAndClose(),
  });
}, [form, createMutation]);
```

**Complex forms (auth, multi-step):** `react-hook-form` + Zod resolver

```typescript
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<FormData>({
  resolver: standardSchemaResolver(formSchema),
  mode: 'onSubmit',
});
```

**Rules:**

- Form schemas should align with shared-types Zod schemas
- Always show validation errors inline
- Submit button uses `loading={mutation.isPending}` prop (NEVER a manual Loader2)

---

## 8. Sheet Patterns (Primary UI for CRUD)

**FormSheet** (from `@app/ui`):

```typescript
<FormSheet
  open={open}
  onOpenChange={onOpenChange}
  title="Create Project"
  mode="edit"              // 'edit' | 'view'
  onSubmit={handleSubmit}
  isSubmitting={mutation.isPending}
>
  {/* Form content */}
</FormSheet>
```

**Rules (NON-NEGOTIABLE — from the repo UI standards):**

- **Sheet** = create, edit, detail views (4+ fields). **Dialog** = quick actions (1-4 fields). **AlertDialog** = destructive confirmations only.
- Edit sheets: block outside click via `onInteractOutside={(e) => e.preventDefault()}`
- View sheets: everything closes (outside click, Escape, X)
- Auto-focus first input on open; Cmd/Ctrl+Enter to submit
- NEVER build custom header layouts with manual close buttons — use the shared sheet components

**Sheet action placement:**

Every sheet's actions live in a **sticky bottom footer**, one row:

```
[ ⋯ overflow ]  ←———— flex-1 spacer ————→  [ secondary CTA(s) (outline) ] [ PRIMARY CTA (filled) ]
```

- **Header = identity + chrome only**: title, status badges, close. Never action buttons.
- **⋯ overflow (bottom-LEFT)**: rare/secondary actions and destructive lifecycle actions (Archive/Deactivate/Void). **Hide the ⋯ trigger entirely when no item applies** — never render an empty menu.
- **Primary CTA (bottom-RIGHT, filled)**: the single next-step for the entity's current state (Assign, Approve, Send — or Edit when nothing else is primary). Secondary CTAs (outline) sit immediately left of it.
- **No lone-⋯ footers**: if a destructive action would be the sheet's ONLY action, promote it to a visible `variant="destructive"` button bottom-right instead of hiding it in ⋯.
- **Edit governs FORM FIELDS only** (a draft with Save/Cancel). **Operational actions** (assign/approve/void) are NOT gated by Edit. Each action resolves to one of three states, chosen by "could this action ever work on this row, if some condition were met?":
  - **enabled** — valid now → shown, clickable.
  - **disabled** — meaningful but a _satisfiable_ condition blocks it → shown, greyed, tooltip names the fix (a disabled control without a reason is a bug). This is the default for blocked-but-fixable.
  - **hidden** — can never apply to this row's terminal/structural reality (archived/voided/completed) → omitted; terminal rows show a calm state label ("✓ Completed").
- **RBAC-forbidden → hidden; state-blocked → disabled.** Never leak the existence of an action a role can't perform.
- **Every destructive action confirms via AlertDialog** — never single-click delete, even tiny trash icons in tables.

**Sheet sizes:** Small `w-full sm:max-w-lg` (4-8 fields); Medium `w-full sm:max-w-2xl` (8+ fields, detail views).

---

## 8.1 Pagination, Sorting, Filters

Two pagination patterns. Pick by whether the state should be shareable.

**Component-state pagination** (default — small lists, internal tools):

```typescript
const PAGE_SIZE = 25;
const [offset, setOffset] = useState(0);
const { data } = useProjects({ limit: PAGE_SIZE, offset });
// Prev: setOffset(o => Math.max(0, o - PAGE_SIZE))
// Next: setOffset(o => o + PAGE_SIZE)  (use placeholderData: keepPreviousData)
```

**URL-state pagination** (deep-linkable — shareable filtered views):

```typescript
const sp = useSearchParams();
const offset = Number(sp.get('offset') ?? 0);
const router = useRouter();
const setOffset = (next: number) => {
  const url = new URLSearchParams(sp.toString());
  next > 0 ? url.set('offset', String(next)) : url.delete('offset');
  router.replace(`?${url.toString()}`, { scroll: false });
};
```

**Always:**

- Cap `limit` at the backend's max page limit — never accept arbitrary user input.
- Pair pagination with `placeholderData: keepPreviousData` so the table doesn't flash a skeleton between pages.
- Sort/filter params live in the same place as offset (both URL or both state). Don't mix.

---

## 8.2 Parent-Level Query Orchestration

When a page has multiple mutation entry points (create sheet, edit panel, bulk actions, dialogs), they all need to refresh the same lists. Don't make every child component re-implement invalidation — give them a single callback from the page:

```typescript
const queryClient = useQueryClient();
const refetchProjects = useCallback(() => {
  queryClient.invalidateQueries({ queryKey: queryKeys.projects.root });
}, [queryClient]);

return <>
  <CreateProjectSheet onCreated={refetchProjects} />
  <ProjectDetailPanel onSave={refetchProjects} onStatusChange={refetchProjects} />
  <BulkArchiveDialog onArchived={refetchProjects} />
</>;
```

Children still own their own mutations and toasts. The page owns "what counts as fresh data after a mutation completed somewhere on this screen."

---

## 9. Table Patterns

**Uses the shadcn/ui Table (from `@app/ui`):**

```typescript
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead className="hidden sm:table-cell">Owner</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map((item) => (
      <TableRow key={item.id}>
        <TableCell>{item.name}</TableCell>
        <TableCell className="hidden sm:table-cell">{item.ownerName}</TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Row actions"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(item)}>Edit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Responsive columns:** `hidden sm:table-cell`, `hidden md:table-cell` — mobile shows only essential columns.

---

## 10. Loading & Feedback (5-Layer System)

| Layer | What             | When               | How                                                  |
| ----- | ---------------- | ------------------ | ---------------------------------------------------- |
| L1    | Top progress bar | Route transitions  | progress bar in layout (automatic)                   |
| L2    | Button spinner   | Mutations          | `<Button loading={isPending}>` (NOT manual Loader2)  |
| L3    | Toast            | Every mutation     | `showSuccess()` + `showError()` from `@app/ui`       |
| L4    | Skeleton         | `isLoading` states | `<Skeleton>` matching layout (NOT spinner, NOT null) |
| L5    | Optimistic       | Low-risk toggles   | TanStack Query `onMutate` cache update               |

**Rules:**

- Every mutation MUST have both success and error toasts
- Every `isLoading` state MUST show a Skeleton (never a full-page spinner, never `return null`)
- Button loading uses the `loading` prop (never manual `<Loader2 className="animate-spin" />`)
- **Skeletons must match the final layout's footprint.** If the loaded view renders a 96px-tall card, the skeleton is `h-24`. If it renders 8 table rows, the skeleton is 8 rows. Layout shift on load is a bug.

---

## 11. Constants & Status Maps

**Query keys:** `@appshore/web-core/shared/constants/query-keys.ts` (centralized, NEVER define keys inline)

**Storage keys:** `@appshore/web-core/shared/constants/storage-keys.ts` — localStorage key registry

**Status/label maps (per feature):**

```typescript
// features/projects/constants.ts — use semantic theme tokens, never raw palette colors
export const PRIORITY_VARIANTS: Record<TaskPriority, { label: string; className: string }> = {
  CRITICAL: { label: 'Critical', className: 'bg-destructive/10 text-destructive' },
  HIGH: { label: 'High', className: 'bg-amber-500/10 text-amber-500' },
  MEDIUM: { label: 'Medium', className: 'bg-amber-500/10 text-amber-500' },
  LOW: { label: 'Low', className: 'bg-muted text-muted-foreground' },
};
```

**Select options** MUST be typed constants (in `constants.ts` or at file top), never inline arrays in JSX, with values from the shared enum:

```typescript
const PROJECT_KINDS = [
  { value: ProjectKind.INTERNAL, label: 'Internal' },
  { value: ProjectKind.CLIENT, label: 'Client' },
] as const;
```

---

## 12. Dark Theme (NON-NEGOTIABLE)

| Element     | NEVER                               | ALWAYS                                                    |
| ----------- | ----------------------------------- | --------------------------------------------------------- |
| Backgrounds | `bg-white`, `bg-gray-50` standalone | `bg-background`, `bg-card`, `bg-gray-50 dark:bg-gray-900` |
| Text        | `text-gray-900` standalone          | `text-foreground`, `text-muted-foreground`                |
| Borders     | `border-gray-200` standalone        | `border-border`                                           |
| Hover       | `hover:bg-gray-100` standalone      | `hover:bg-gray-100 dark:hover:bg-gray-800`                |

Prefer semantic tokens over paired raw colors. Status colors are allowed with opacity/dark-safe variants: `bg-red-500/10 text-red-500`.

---

## 13. Responsive Design

Mobile-first. Test at 375px, 768px, 1440px in both themes.

```typescript
// Grid: mobile single col, desktop 2-col
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// Table columns: hide non-essential on mobile
<TableHead className="hidden sm:table-cell">Owner</TableHead>

// Touch targets: min 44x44px
<Button size="icon" className="h-11 w-11">
```

---

## 14. Shared Utilities (NEVER duplicate)

| Utility                     | Location                                                   | Use For                     |
| --------------------------- | ---------------------------------------------------------- | --------------------------- |
| `showSuccess` / `showError` | `@app/ui`                                                  | Toast notifications         |
| `cn()`                      | `@app/ui`                                                  | Class merging               |
| `apiClient`                 | `@appshore/web-core/shared/lib/api`                        | Authenticated API calls     |
| `extractErrorMessage`       | `@appshore/web-core/shared/lib/error-utils`                | User-friendly error strings |
| `extractFieldErrors`        | `@appshore/web-core/shared/lib/error-utils`                | Field-level validation map  |
| Date/time formatters        | `@appshore/web-core/shared/lib/` (date-utils, format-time) | Dates, relative time        |

**NEVER create inline `formatRelativeTime`, `formatDate`, or similar helpers** — check `@appshore/web-core/shared/lib/` first; add new formatters there, not in feature code.

---

## 15. Component Patterns

**`'use client'`** on every interactive component. Push the boundary as far down as possible.

**Feature gate:** wrap feature-flagged UI in the shared feature-guard component so gated features render nothing (or an upsell) when disabled.

**Page structure:** every sidebar page uses the canonical **page chrome** (§15.4) — `PageHeader` + `PageToolbar` + `FilterBar`. Do NOT hand-roll the header `<div className="flex … justify-between"><h1>…`.

---

## 15.4 Page Chrome (Layout & Control Patterns) — NON-NEGOTIABLE

**Every sidebar page uses one canonical chrome.** Components live in `apps/web/src/shared/components/page-chrome/` (`PageHeader`, `PageToolbar`, `PageTabs`, `FilterBar`, `StatusPivot`, `SegmentedControl`, `ViewSwitcher`, `PageActionsMenu`, `PageEmptyState`, `PageLoadingSkeleton`). Four zones, top to bottom:

```
Zone 1 · Header        PageHeader: title (REQUIRED) + subtitle (REQUIRED) + optional ⚙ settings gear
   (KPI row)           OPTIONAL metric/stat cards — between Header and Toolbar
Zone 2 · Toolbar       PageToolbar: NAV tabs (underline, left) · right cluster FIXED → [⋯ More][1° CTA][2° CTA][view][group]
Zone 3 · Filter bar    StatusPivot (status filter) + FilterBar: search (left) · filter dropdowns (middle) · sort (right)
Zone 4 · Data          the page's own board/table/cards/list (not part of the chrome)
```

**KPI row (optional):** ambient metric/stat cards render as a **metric row immediately after the Header and before the Toolbar** — a grid of cards (`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4`). Page-owned content, not a chrome component. Never interleave KPIs into the toolbar or filter bar.

**Tabs vs. pivot — the critical distinction:**

| Concept           | Means                                    | Style                                       | Component                                   | Zone           |
| ----------------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------- | -------------- |
| **Navigation**    | switches _which section/entity_ you view | **underline tabs**                          | `PageTabs`/`PageTabsList`/`PageTabsTrigger` | 2 (Toolbar)    |
| **Status filter** | filters/scopes _the current list_        | **text pivot** (label + count, active=bold) | `StatusPivot`                               | 3 (Filter bar) |

Rule of thumb: clicking it changes the _dataset/entity_ → underline tab; it _filters the current list_ → `StatusPivot`.

**Third control — `SegmentedControl` (boxed toggle):** for compact mutually-exclusive sub-choices that are neither page nav nor the status funnel (e.g. a Type sub-tab, or a lifecycle filter Active/Inactive/All). Use the shared component — don't hand-roll boxed button groups.

**Rules (NON-NEGOTIABLE):**

- **Title AND subtitle are both REQUIRED** on every page. Subtitle is the page's one-line promise. No page ships without both.
- **Right-cluster order is FIXED** (right→left): `⋯ More · 1° CTA · 2° CTA · view · group`. One primary CTA per page.
- **`⋯ More` (`PageActionsMenu`) = THIS page's overflow actions** (Refresh, Export). It is NOT the ⌘K command palette, which is GLOBAL navigate-anywhere + search. Different glyph, different scope — never put page actions behind ⌘K, never put global nav behind ⋯.
- **`ViewSwitcher` vs group switcher**: view = how data is _drawn_ (Board/Table); group = how it's _clustered_. They are separate axes — never a single multi-way toggle that mixes layouts and groupings.
- **Canvas opt-out**: full-bleed workspaces that escape shell padding and own their chrome opt OUT of `PageHeader`/`PageToolbar` — document the reason with a code comment. They still honor the spirit of the zones: lift workspace-wide controls into a **single control row above the panes**. One filter, one place, all panes — a multi-pane canvas must NOT have the same filter twice.
- **Empty/loading**: use `PageEmptyState` and `PageLoadingSkeleton` (shaped, never a bare spinner) — see §10.

---

## 15.1 Component Composition (Avoiding Prop-Drill Hell)

A detail panel at the top of a tab tree (Overview / Activity / Settings) where every tab needs `project`, `onSave`, `onStatusChange`: prop drilling is fine **two levels deep**. Past three, switch to a focused context.

**Rule:** if a value is being passed through **3+ intermediate components that don't use it**, create a context. Otherwise drill.

```typescript
// features/projects/context/project-detail.context.tsx
const ProjectDetailContext = createContext<ProjectDetailContextValue | null>(null);
export const ProjectDetailProvider = ProjectDetailContext.Provider;
export const useProjectDetail = () => {
  const ctx = useContext(ProjectDetailContext);
  if (!ctx) throw new Error('useProjectDetail must be used inside <ProjectDetailProvider>');
  return ctx;
};
```

Keep the context **feature-scoped** (one per detail tree). Don't put a global `AppContext` in `shared/` — that's how things ossify.

---

## 15.2 Code-Splitting Heavy Components

Heavy dependencies (PDF renderer, map, chart library, editor) MUST be loaded with `next/dynamic`:

```typescript
const PdfPreview = dynamic(() => import('./pdf-preview'), {
  ssr: false,
  loading: () => <Skeleton className="h-[600px] w-full" />,
});
```

**Rules:**

- Always supply a `loading` fallback that matches the final component's footprint — no layout shift.
- `ssr: false` for anything that touches `window`, `document`, or browser-only globals.
- Lazy-load at component boundaries, not inside `useEffect`.

---

## 15.3 Server Components & Streaming (When to Use Them)

Most authenticated pages here are Client Components — `'use client'` at the top, TanStack Query everywhere — because data is highly interactive and SSE-driven. That's the right default for an operational app.

**Use Server Components for:**

- Marketing/public pages (no auth, SEO-relevant).
- Settings/admin pages where the initial render is mostly read-only and not real-time.
- Wrapping a Client Component with a Server Component that pre-fetches the _first_ page of data into the QueryClient via `dehydrate`/`HydrationBoundary`.

```typescript
// page.tsx (Server Component)
export default async function Page() {
  const qc = new QueryClient();
  await qc.prefetchQuery({ queryKey: queryKeys.projects.list({}), queryFn: () => fetchProjects() });
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ProjectsClient />  {/* 'use client' — uses useProjects() and gets a cache hit */}
    </HydrationBoundary>
  );
}
```

**Don't reach for Server Components for:** anything that needs SSE / mutations, or tabbed panels where the user controls the active tab.

---

## 16. Middleware (Route Protection)

`apps/web/src/middleware.ts` checks auth/role presence cookies for role-based routing:

- Enforces which roles access which route prefixes
- Extracts the tenant (subdomain in multi-tenant mode) for Server Components
- Redirects unauthorized roles to their default route
- **Not a security boundary** — real RBAC is enforced at the backend

---

## 17. Auth Flow

1. User signs in with first-party email+password (primary; phone OTP and Firebase exchange optional)
2. Backend returns JWT access token + httpOnly refresh cookie
3. Zustand stores `accessToken` + `user`; the session bridge (`@appshore/web-core/auth/session-bridge`) connects the store to the API client
4. Presence cookies are set for middleware routing
5. On 401: auto-refresh via the httpOnly cookie (concurrent 401s deduplicated)

---

## 18. Provider Stack (Root Layout)

```
ThemeProvider → QueryClientProvider → AuthProvider → TooltipProvider → {children}
```

- Sonner Toaster, system theme
- Suspense boundaries with fallbacks
- Global QueryClient defaults: short staleTime, `retry: 1`, mutations `retry: 0`

---

## 19. @app/ui Package

Shared monorepo UI package (`packages/ui/`) exports:

- `cn()` — clsx + tailwind-merge
- `showSuccess()`, `showSuccessWithLink()`, `showError()`, toast wrappers (Sonner)
- The shadcn component set (accordion, alert, badge, button, card, dialog, sheet, table, tabs, etc.)
- `FormSheet` — smart sheet wrapper
- Tailwind preset with semantic color tokens, dark mode, animations

Use `@app/ui` components only — no raw `<button>`/`<input>`/`<select>`/`<table>`.

---

## 20. Command Palette

- Cmd+K / Ctrl+K shortcut (`apps/web/src/shared/components/command-palette/`)
- Debounced fuzzy search via React Query
- Groups: Recent, Quick Actions, Results, Navigation
- Global scope — page-level actions belong in `PageActionsMenu` (§15.4), not here

---

## 21. Prefetch Pattern

```typescript
// Prefetch detail data when opening a sheet from a list
queryClient.prefetchQuery({
  queryKey: queryKeys.projects.detail(projectId),
  queryFn: () => projectsApi.getById(projectId),
});
```

Use on hover/click-intent for instant sheet opening.

---

## 22. Error Handling Architecture

### 22.1 Error Utilities (`@appshore/web-core/shared/lib/error-utils.ts`)

- **`extractErrorMessage(error)`** — user-friendly string from any error. Status-code-aware for ApiError, network-aware for fetch failures, generic fallback for unknown errors.
- **`extractFieldErrors(error)`** — `Record<string, string>` of field-level validation errors from the backend, or `undefined`. Use with react-hook-form's `setError()`.
- **`extractErrorCode(error)`** — machine-readable error code when the backend provides one.

### 22.2 Mutation Error Pattern (MANDATORY)

Every mutation MUST have `showSuccess()` on success. For `onError`:

```typescript
// Option A: custom error message (preferred when you have context)
onError: (error) => {
  showError('Failed to approve request', extractErrorMessage(error));
},

// Option B: omit onError entirely — a global MutationCache fallback shows the toast.
// Use ONLY for simple mutations where a generic message is fine, and verify the toast appears.
```

### 22.3 Error Boundaries

| File                   | Scope               | Behavior                                     |
| ---------------------- | ------------------- | -------------------------------------------- |
| `app/global-error.tsx` | Root (layout crash) | Full-page branded error, own `<html>`        |
| `app/error.tsx`        | Any route segment   | Shows error in content area, layout survives |
| `app/not-found.tsx`    | 404                 | Branded, with navigation back                |

**Rules:**

- Error boundaries report via the error-tracking helper (`@appshore/web-core/shared/lib/sentry.ts` — `captureError()`)
- Dev mode shows the stack trace; production shows only a user-friendly message
- Never lose the user's layout/navigation — they must always be able to navigate away
- `error.tsx` components MUST be `'use client'`

### 22.4 Network Status

Use `useNetworkStatus()` (`@appshore/web-core/shared/hooks/use-network-status.ts`) + a banner at the top of the app layout: offline warning, brief "connection restored", nothing when online.

### 22.5 API Error Shape (from the backend global filter)

```typescript
{
  statusCode: 400,
  detail: "User-friendly message",          // Always safe to show in a toast
  fieldErrors?: { email: "Must be valid" }, // Only on validation errors
  debugDetail?: "Technical details...",     // Only in development
}
```

`extractErrorMessage()` reads `detail`. `extractFieldErrors()` reads `fieldErrors`.

---

## 23. No Magic Strings (NON-NEGOTIABLE)

**NEVER inline string literals that represent domain values, statuses, roles, event types, query keys, storage keys, or any repeated constant.**

**Hierarchy (prefer top to bottom):**

1. **Shared-types enum/const** — `TaskStatus`, `UserRole` (from `@app/shared-types`)
2. **Centralized constants** — `queryKeys.projects.detail(id)`, `SSE_EVENTS.*`, `QUERY_TIERS.OPERATIONAL`, storage keys
3. **Feature-level constants** — `STATUS_VARIANTS`, `PRIORITY_LABELS` (in `features/{domain}/constants.ts`)
4. **File-level `const`** — if truly local, a named `const` at the top of the file (never inline in JSX/logic)

**Common violations to catch:**

| BAD (magic string)                     | GOOD (named constant)                                |
| -------------------------------------- | ---------------------------------------------------- |
| `if (task.status === 'DONE')`          | `if (task.status === TaskStatus.DONE)`               |
| `queryKey: ['projects', id]`           | `queryKey: queryKeys.projects.detail(id)`            |
| `localStorage.getItem('auth-storage')` | use the registered storage key constant              |
| `staleTime: 30000`                     | `...QUERY_TIERS.OPERATIONAL`                         |
| `if (user.role === 'ADMIN')`           | `if (user.role === UserRole.ADMIN)`                  |
| `apiClient('/projects/...')`           | OK — API paths are infrastructure, not domain tokens |
| `showSuccess('Project created')`       | OK — toast messages are user-facing prose            |
| `className="bg-red-500/10"`            | OK — Tailwind classes are styling primitives         |

---

## 24. Anti-Patterns (NEVER Do These)

- NEVER `<div onClick={...}>` without keyboard support — use `<button>` semantics via the `@app/ui` Button, or add `role="button"`, `tabIndex={0}`, `onKeyDown`
- NEVER import heavy libraries (maps, charts, PDF) at top level — use `dynamic(() => import(...), { ssr: false, loading: () => <Skeleton /> })`
- NEVER `as any` to bypass type safety — fix the type definition in `@app/shared-types` instead
- NEVER render bare `{data}` without loading/error states — every `useQuery` must handle `isLoading` (Skeleton) and `isError` (toast or inline error)
- NEVER show raw `error.message` in toasts — always use `extractErrorMessage(error)` or a custom user-friendly string
- NEVER create a mutation without either an `onError` handler or a verified global fallback toast
- NEVER use `console.error` for production error tracking — use `captureError()`

---

## 25. New Feature Checklist

- [ ] Page chrome: `PageHeader` + `PageToolbar` + `FilterBar` from `shared/components/page-chrome` — title AND subtitle present; fixed right-cluster order; never hand-roll the header (§15.4)
- [ ] Types: re-export from `@app/shared-types` (no local entity types)
- [ ] API: object namespace pattern (`entityApi.method()`) over `apiClient`
- [ ] Query keys: added to the centralized `query-keys.ts` (list/detail segments distinct)
- [ ] Query hooks: conditional `enabled`, correct tier config
- [ ] Mutation hooks: both `showSuccess()` and `showError()` toasts
- [ ] SSE: if real-time, add to the invalidation map (+ backend registry/bridge)
- [ ] Sheet vs Dialog vs AlertDialog per the 4+-fields / quick-action / destructive rule
- [ ] Forms: submit via `loading` prop, never manual Loader2
- [ ] Loading: Skeleton for `isLoading`, never spinner/null
- [ ] Dark mode: no standalone light colors; semantic tokens
- [ ] Responsive: mobile-first, tested at 375/768/1440
- [ ] shadcn: `@app/ui` components (never plain HTML elements)
- [ ] No magic strings: statuses, roles, events, query keys use enums/constants (§23)
- [ ] Formatters: shared utils from web-core, never inline helpers
- [ ] Storage keys: register in `storage-keys.ts` if using localStorage
- [ ] Mutation errors: explicit `onError` with `extractErrorMessage()` or verified global fallback
- [ ] Error tracking: `captureError()` for unexpected failures
- [ ] Microcopy: page title/subtitle follows the microcopy style (§26)

---

## 26. Conversational Microcopy

Every page header has a **title** and a **subtitle**. Write them in a casual-confident voice — a smart colleague explaining the app, not a manual describing it.

### Tone: Casual-Confident

- Not corporate ("Manage and configure your..."), not cutesy ("Let's get billing done! 🎉")
- Confident, concise, human — like a power user explaining their screen to a new teammate

### 5 Techniques

| Technique                | Bad                                   | Good                                       | Rule                                                                             |
| ------------------------ | ------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| **Drop the verb**        | "Manage your wallet and invoices"     | "Wallet, payment methods, and invoices"    | Never start with Manage/Configure/View/Monitor — the user knows they can do that |
| **Speak to outcomes**    | "Calculate and manage team payouts"   | "What your team earned, settled fast"      | Describe what happens, not what the tool does                                    |
| **Use the user's voice** | "Monitor system alerts"               | "What needs your attention"                | Write how the user _thinks_ about it                                             |
| **Rhythm & brevity**     | "Send, track, and manage invoices"    | "Invoices out, payments in"                | Short and punchy — almost a tagline                                              |
| **Em dash for context**  | "Search requests and review messages" | "Requests and messages — all in one place" | One thought — then the kicker                                                    |

### Titles

- Keep titles **short** (1-2 words preferred): "Billing" not "Billing Management"
- Title should match the sidebar nav label exactly

### Subtitles

- One line, under ~60 characters when possible
- No period at the end (unless it's a full sentence that reads better with one)
