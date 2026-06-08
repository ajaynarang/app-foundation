---
title: Feature Modules
description: The apps/web/src/features/ layout — 24 features, the per-feature folder shape, how features compose pages.
---

# Feature Modules

Routes (`app/`) are thin. Feature modules (`features/`) hold the substance — components, hooks, API calls, types, optional Zustand stores. A page composes feature components; a feature owns the shape of one part of the product.

## The features

24 folders under `apps/web/src/features/`:

```
add-ons              admin-events         ai                   analytics
auth                 billing              customer             desk
driver               edi                  email-intake         feedback
financials           fleet                fuel-cards           home
horizon              integrations         operations           platform
routing              support              system-activity      webhooks
```

Each loosely matches a backend domain (`apps/backend/src/domains/`). When the mapping isn't 1:1 — e.g. `horizon`, which is a forward-looking analytics surface — there's a reason; check the feature's README or the team.

## The per-feature folder shape

The canonical shape, observed across the codebase. Using `features/fleet/convoys/` as an example:

```
features/fleet/convoys/
├── components/           Feature UI — Sheets, Tables, Forms, Cards
│   ├── ConvoyTable.tsx
│   ├── ConvoyDetailSheet.tsx
│   └── ConvoyMembershipForm.tsx
├── hooks/                Custom hooks
│   ├── use-convoys.ts          ← queries (useQuery)
│   └── use-convoy-actions.ts   ← mutations (useMutation)
├── api/                  fetchers — talk to the backend
│   └── convoys.api.ts
├── types/                Local TS types (often re-exporting from @sally/shared-types)
│   └── index.ts
├── store/                Optional Zustand store, scoped to the feature (or store.ts file)
└── index.ts              Public surface — what other features can import
```

Some larger features have an additional layer for sub-entities:

```
features/fleet/
├── drivers/
├── vehicles/
├── loads/
├── trailers/
├── recurring-lanes/
├── convoys/                  ← the example above
└── documents/
```

Smaller features have just one level — `features/feedback/` doesn't need sub-entities.

## Pages compose features

A page in `app/dispatcher/loads/page.tsx` imports from `features/fleet/loads/components/`. Pages should be thin:

```tsx
// app/dispatcher/loads/page.tsx
'use client';
import { LoadsTable } from '@/features/fleet/loads/components/LoadsTable';
import { LoadCreateSheet } from '@/features/fleet/loads/components/LoadCreateSheet';

export default function LoadsPage() {
  return (
    <div className="space-y-4">
      <LoadCreateSheet />
      <LoadsTable />
    </div>
  );
}
```

When a page starts accumulating real logic (data fetching, complex layout, state), refactor that into the feature module. Pages are the routing seam, not where work happens.

## Query keys — single source of truth

Every TanStack Query hook uses keys from the central factory:

```ts
// shared/constants/query-keys.ts (excerpt)
export const queryKeys = {
  loads: {
    root: ['loads'] as const,
    list: (params: Record<string, unknown>) => ['loads', params] as const,
    board: ['loads', 'board'] as const,
    detail: (id: string) => ['loads', id] as const,
    charges: (id: string) => ['loads', id, 'charges'] as const,
    notes: (id: string) => ['loads', id, 'notes'] as const,
    revertPreview: (id: string, status: string) => ['loads', id, 'revert-preview', status] as const,
  },
  // …
};
```

**Hooks NEVER define local key constants** — that's the rule the factory header makes explicit. Add a new key here when you add a new query.

## A query hook

```tsx
// features/fleet/loads/hooks/use-loads.ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { fetchLoads } from '../api/loads.api';
import type { LoadsListParams } from '@/shared/types/loads';

export function useLoads(params: LoadsListParams) {
  return useQuery({
    queryKey: queryKeys.loads.list(params as Record<string, unknown>),
    queryFn: () => fetchLoads(params),
    staleTime: 30_000,
  });
}
```

## A mutation hook

```tsx
// features/fleet/loads/hooks/use-load-actions.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import { showSuccess, showError } from '@sally/ui';
import { dispatchLoad } from '../api/loads.api';

export function useDispatchLoad() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: { loadId: string; driverId: string }) =>
      dispatchLoad(vars.loadId, vars.driverId),

    onSuccess: () => {
      showSuccess('Load dispatched');
      qc.invalidateQueries({ queryKey: queryKeys.loads.root });
    },

    onError: (err) => {
      showError(err);
    },
  });
}
```

Both `showSuccess` and `showError` are mandatory on every mutation — see [UI Standards](../standards/frontend.md).

## Cross-feature imports

A feature can import another feature's **public surface** (`features/x/index.ts`), not its internals. If you find yourself importing `features/x/components/SomeInternalThing.tsx` from a different feature, either:

- Export `SomeInternalThing` from `features/x/index.ts` and treat it as a stable surface, or
- Move it to `shared/components/` if it's genuinely shared.

The features have boundaries; respect them.

## Shared infrastructure

When something is needed across features, it goes in `apps/web/src/shared/`:

- `shared/components/` — cross-feature components (incl. the canonical `FormSheet` at `shared/components/ui/form-sheet.tsx`).
- `shared/hooks/` — generic hooks.
- `shared/lib/` — utilities, the toast shim, API client, etc.
- `shared/constants/` — query keys, app constants, navigation configs.
- `shared/realtime/` — SSE infrastructure (bus, context, hook, invalidation map).
- `shared/stores/` — Zustand stores that live across features (currently just `sheet-size.store.ts`).
- `shared/providers/` — React providers that wrap the app.

## Adding a new feature

1. Pick a name that matches its backend domain when possible.
2. Create `features/<name>/` with `components/`, `hooks/`, `api/`, `types/`, `index.ts`.
3. Add the routes that use the feature under `app/<audience>/<thing>/`.
4. Register the navigation entry in the audience's nav config.
5. Add a backend domain (if one doesn't exist) — see [Backend → Module Structure](../backend/module-structure.md).
