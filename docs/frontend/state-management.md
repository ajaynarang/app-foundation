---
title: State Management
description: Three layers — TanStack Query (server state), Zustand (client state), component state. When to use which.
---

# State Management

Three layers. Each owns one kind of state. Don't blur the lines.

| Layer | Owns | Library |
|---|---|---|
| **Server state** | Anything the backend is authoritative about — loads, drivers, invoices, settings | TanStack Query 5 |
| **Client state across pages** | UI preferences, auth flag, sheet sizing | Zustand 5 |
| **Component-local state** | Form drafts, hover, expand/collapse, "did the user click this yet" | `useState` / `useReducer` |

## TanStack Query — server state

Every backend round-trip goes through TanStack Query. Two reasons:

1. **Caching** — the same data isn't refetched on every component mount.
2. **Invalidation by key** — when a `load.dispatched` SSE event arrives, the central invalidation map kicks all open `loads.*` queries to refetch. Without a key system, this would be impossible.

### Query keys come from the central factory

`apps/web/src/shared/constants/query-keys.ts` is the single source of truth. The file header makes the rule explicit:

> Hooks should import from here and NEVER define local query key constants.

Pattern per entity:

```ts
loads: {
  root: ['loads'] as const,
  list: (params: Record<string, unknown>) => ['loads', params] as const,
  detail: (id: string) => ['loads', id] as const,
  charges: (id: string) => ['loads', id, 'charges'] as const,
  // ...
}
```

`root` is the broadest key for invalidation. `list(params)` includes the filter params so distinct filters get distinct cache entries. `detail(id)` is per-entity. Sub-keys (`charges`, `notes`) extend further.

### A typical query hook

```ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { fetchLoad } from '../api/loads.api';

export function useLoad(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loads.detail(id ?? ''),
    queryFn: () => fetchLoad(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
```

`staleTime` of 30s is a common default — adjust per query. For data that changes via SSE, a longer `staleTime` is fine (the SSE event will invalidate when something changes).

### Prefetch on hover

List → detail transitions **must** prefetch on hover:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { fetchLoad } from '@/features/fleet/loads/api/loads.api';

export function LoadRow({ load }: { load: LoadListItem }) {
  const qc = useQueryClient();

  return (
    <tr
      onMouseEnter={() =>
        qc.prefetchQuery({
          queryKey: queryKeys.loads.detail(load.id),
          queryFn: () => fetchLoad(load.id),
        })
      }
      onClick={() => openDetailSheet(load.id)}
    >
      …
    </tr>
  );
}
```

The detail sheet opens instantly because the data is already in the cache by the time it asks.

### Sheets derive from cache

If a Sheet shows a row that the user opened from a list, the Sheet must **derive its data from the query cache via `useMemo`**, not from a stale prop. The list might refresh while the Sheet is open; you want the Sheet to see the new data.

```tsx
const { data: loads } = useLoads(params);
const [openId, setOpenId] = useState<string | null>(null);
const openLoad = useMemo(() => loads?.items.find((l) => l.id === openId), [loads, openId]);
```

Not:

```tsx
// WRONG — the prop snapshots stale data
<LoadSheet load={listRowData} />
```

### A typical mutation hook

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants/query-keys';
import { dispatchLoad } from '../api/loads.api';

export function useDispatchLoad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loadId, driverId }: { loadId: string; driverId: string }) =>
      dispatchLoad(loadId, driverId),
    onSuccess: (_data, vars) => {
      showSuccess('Load dispatched');
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
      qc.invalidateQueries({ queryKey: queryKeys.drivers.detail(vars.driverId) });
    },
    onError: (err) => showError(err),
  });
}
```

Both `showSuccess` and `showError` on every mutation. Non-negotiable.

### Optimistic updates

For low-risk toggles (a feature flag, a "favorite" star), use `onMutate` to update the cache eagerly, with `onError` rollback:

```ts
useMutation({
  mutationFn: setFavorite,
  onMutate: async ({ id, isFavorite }) => {
    await qc.cancelQueries({ queryKey: queryKeys.loads.detail(id) });
    const previous = qc.getQueryData(queryKeys.loads.detail(id));
    qc.setQueryData(queryKeys.loads.detail(id), (old: any) => ({ ...old, isFavorite }));
    return { previous };
  },
  onError: (_err, vars, ctx) => {
    if (ctx?.previous) qc.setQueryData(queryKeys.loads.detail(vars.id), ctx.previous);
    showError('Could not update favorite');
  },
  onSettled: (_data, _err, vars) => {
    qc.invalidateQueries({ queryKey: queryKeys.loads.detail(vars.id) });
  },
});
```

For high-risk mutations (dispatch a load, post a payment), don't go optimistic — show the L2 button spinner and wait for the response.

## Zustand — client state across pages

Use Zustand when state needs to survive a page navigation but isn't on the server. Examples:

- **Sheet sizing preference** — `shared/stores/sheet-size.store.ts`, persisted to localStorage with `zustand/middleware`'s `persist`.
- **Auth flag** — `features/auth/store.ts`.
- **In-flight onboarding state** — `features/platform/onboarding/store.ts`.
- **Desk UI state** — `features/desk/store/desk-store.ts`.
- **Routing optimization wizard state** — `features/routing/optimization/store.ts`.

### A typical store

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SheetSizeState {
  sizeMode: 'sm' | 'md' | 'lg';
  setSizeMode: (mode: 'sm' | 'md' | 'lg') => void;
}

export const useSheetSizeStore = create<SheetSizeState>()(
  persist(
    (set) => ({
      sizeMode: 'md',
      setSizeMode: (mode) => set({ sizeMode: mode }),
    }),
    { name: 'sally:sheet-size' },
  ),
);
```

### Where stores go

- **Shared across features:** `apps/web/src/shared/stores/`.
- **Feature-scoped:** `features/<feature>/store.ts` or `features/<feature>/store/<name>.ts`.

Don't reach for a store when component state would do.

## Component state

For ephemeral UI — form drafts inside a Sheet, hover state, "did the user dismiss this banner this session" — use `useState` / `useReducer`. No Zustand, no TanStack Query. Keep it local.

When the form is submitted, the data goes through a mutation hook (TanStack Query). When the Sheet closes, the local state disappears. That's fine.

## What goes where — quick reference

| Kind of state | Layer |
|---|---|
| List of loads from the backend | TanStack Query (`useLoads`) |
| Currently-selected load ID in a list | Component state (`useState`) |
| Form draft inside an edit sheet | Component state |
| Sheet width preference (persisted) | Zustand (`useSheetSizeStore`) |
| Auth user object | Backend → TanStack Query OR Zustand auth store (depending on shape) |
| "Did the user dismiss the tour?" | Zustand `tour` store (persisted) |
| Optimistic toggle state | TanStack Query `onMutate` cache write |
| Sidebar collapsed/expanded | Zustand (persists across pages) |

## SSE invalidation — the bridge

Server-Sent Events update the client without polling. The bridge:

1. Backend emits a `DomainEvent` (e.g. `load.dispatched`).
2. The SSE bridge fan-outs it to connected clients for the matching tenant.
3. The frontend SSE provider receives it.
4. `shared/realtime/invalidation-map.ts` maps the event name to a list of query keys.
5. Those queries get `invalidateQueries` called on them — TanStack Query refetches.

You don't write SSE-handling code per query. Add the event → invalidation rule to the central map; the wiring takes it from there.

If you find yourself reaching for `useEffect(() => poll(...), [])`, stop. SSE handles the freshness.
