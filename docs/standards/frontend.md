---
title: Frontend Standards
description: Next.js-side rules — dark theme, Shadcn-only, Sheet vs Dialog, FormSheet, the 5-layer loading model, query keys, responsive.
---

# Frontend Standards

Rules code review enforces on `apps/web/` and `apps/console/` changes. Cross-cutting rules (camelCase, palette, emails) live on [Platform Standards](platform.md).

## Dark theme support — always

**Rule:** every color decision works in both themes. Use semantic tokens; if you must use a raw Tailwind color, always supply the dark variant.

| Element | NEVER | ALWAYS |
|---|---|---|
| Backgrounds | `bg-white`, `bg-gray-50` standalone | `bg-background`, `bg-card`, OR `bg-gray-50 dark:bg-gray-900` |
| Text | `text-gray-900`, `text-gray-600` standalone | `text-foreground`, `text-muted-foreground` |
| Borders | `border-gray-200` standalone | `border-border` |
| Hover | `hover:bg-gray-100` standalone | `hover:bg-gray-100 dark:hover:bg-gray-800` |

The full palette and rationale: [Platform Standards → Color palette](platform.md#color-palette-semantic-tokens-only).

## `@sally/ui` components only

**Rule:** never plain `<button>`, `<input>`, `<select>`, `<table>`, `<label>`. Use the primitives from `@sally/ui`.

```tsx
// CORRECT
import { Button, Input, Select } from '@sally/ui';

<Button variant="default" loading={isPending}>Save</Button>
<Input placeholder="Driver name" />
```

```tsx
// WRONG
<button className="rounded bg-blue-500 px-3 py-1 text-white">Save</button>
```

If a primitive isn't installed:

```bash
cd packages/ui
npx shadcn@latest add <component-name>
# then export from packages/ui/src/index.ts (or appropriate barrel)
```

Available primitives (non-exhaustive — check `packages/ui/src/components/ui/`):

- Forms: `Button`, `Input`, `Label`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Calendar`, `PhoneInput`
- Overlays: `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `Tooltip`, `Command`
- Display: `Card`, `Badge`, `Alert`, `Avatar`, `Separator`, `Skeleton`, `Progress`, `ScrollArea`, `Tabs`, `Accordion`, `Table`, `ToggleGroup`
- Sally extensions: `FormSheet`, `SheetSection`, `SallyInsight`, `InfoItem`, `UrlRow`, `CopyButton`

App-local overrides live in `apps/web/src/components/ui/` (`OtpInput`, `PinInput`) for primitives that don't belong in the shared package.

## Dialog vs Sheet vs AlertDialog

**Rule:** three overlay components, three purposes. Pick by the rule, not by what looks nice.

| Component | Use for | Behavior |
|---|---|---|
| **Sheet** (via `FormSheet`) | Create, edit, detail views with **4+ fields** | Block outside-click in edit/create. Escape, X, Cancel close. View-only: everything closes. Auto-focus first input. Cmd+Enter submits. |
| **Dialog** | Quick actions, **1–3 fields**, invites, file uploads | Outside-click and Escape close. |
| **AlertDialog** | Destructive confirmation only | Delete, discard, revoke. Explicit confirm + cancel buttons. |

### `FormSheet` — the canonical create/edit/detail pattern

`apps/web/src/shared/components/ui/form-sheet.tsx` is the web-app-canonical FormSheet. (A simpler base lives in `@sally/ui`; the web extension adds rich-title support, persisted sheet sizing, and size controls.) **All web consumers import from `@/shared/components/ui/form-sheet`.**

```tsx
import { FormSheet } from '@/shared/components/ui/form-sheet';

function LoadCreateSheet() {
  const [open, setOpen] = useState(false);
  const mutation = useCreateLoad();

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      title="New load"
      description="Create a load from the dispatcher board"
      mode="edit"
      onSubmit={() => mutation.mutate(formValues)}
      onCancel={() => setOpen(false)}
      submitLabel="Create"
      isSubmitting={mutation.isPending}
      submitDisabled={!isValid}
    >
      <Input … />
      {/* … 4+ fields … */}
    </FormSheet>
  );
}
```

For a rich title (avatar + badges), pass `titleNode`. For view-only, pass `mode="view"`.

```tsx
// AlertDialog example
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogAction, AlertDialogCancel } from '@sally/ui';

<AlertDialog open={open} onOpenChange={setOpen}>
  <AlertDialogContent>
    <AlertDialogTitle>Delete load?</AlertDialogTitle>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={onDelete} className="bg-critical text-critical-foreground">
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## The 5-layer loading model

**Rule:** every page provides loading feedback at the layers that apply.

| Layer | What | When | How |
|---|---|---|---|
| **L1 — Top progress bar** | 2px bar at top of viewport | Route transitions | `ProgressProvider` from `@bprogress/next/app` (already wired in `layout-client.tsx`). Use `useRouter` from `@bprogress/next/app`, NOT from `next/navigation`. |
| **L2 — Button loading** | Spinner inside the button | Mutations | `<Button loading={isPending}>` from `@sally/ui`. Never a manual `<Loader2>` inside a Button. |
| **L3 — Toasts** | Floating notification | Every mutation | Both `showSuccess()` AND `showError()` from `@sally/ui`. Required. |
| **L4 — Skeleton** | Shaped placeholder | Every `isLoading` state | `<Skeleton>` from `@sally/ui`, matching the loaded content's shape. NOT a spinner. NOT `null`. |
| **L5 — Optimistic update** | Cache mutated before server responds | Low-risk toggles only | TanStack Query `onMutate` + `onError` rollback. |

### L3 — toasts on every mutation

```ts
useMutation({
  mutationFn: …,
  onSuccess: () => showSuccess('Saved'),
  onError: (err) => showError(err),
});
```

Both required. For mutations that should link somewhere on success: `showSuccessWithLink('Invoice created', '/dispatcher/billing/invoices/INV-123')`.

### L4 — Skeleton, not spinner, not null

```tsx
if (isLoading) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
```

For pages, put a `loading.tsx` next to `page.tsx` — Next.js renders it automatically during route segment loading.

### L5 — optimistic, only when low-risk

Optimistic is for toggles (favorite, archive, enable a feature). NOT for high-risk operations (dispatch a load, void an invoice, send a payment) — those wait for the response with the L2 spinner.

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
    showError('Could not update');
  },
  onSettled: (_data, _err, vars) => {
    qc.invalidateQueries({ queryKey: queryKeys.loads.detail(vars.id) });
  },
});
```

## Sheets derive from the query cache

**Rule:** Sheets that show data from a list MUST derive that data from the query cache via `useMemo`, not from a stale prop.

```tsx
// CORRECT — Sheet sees fresh data when the list refreshes
const { data: loads } = useLoads(params);
const [openId, setOpenId] = useState<string | null>(null);
const openLoad = useMemo(() => loads?.items.find((l) => l.id === openId), [loads, openId]);
```

```tsx
// WRONG — snapshots stale data the moment the list refreshes
<LoadSheet load={listRowData} open={…} />
```

## Prefetch on hover

**Rule:** list → detail transitions prefetch on hover with `queryClient.prefetchQuery()`. The detail sheet opens instantly.

```tsx
import { useQueryClient } from '@tanstack/react-query';

const qc = useQueryClient();

<tr
  onMouseEnter={() =>
    qc.prefetchQuery({
      queryKey: queryKeys.loads.detail(load.id),
      queryFn: () => fetchLoad(load.id),
    })
  }
  onClick={() => setOpenId(load.id)}
>
  …
</tr>
```

## Centralized query keys

**Rule:** every TanStack Query hook imports its key from `apps/web/src/shared/constants/query-keys.ts`. Never define local key constants in hooks.

```ts
// CORRECT
import { queryKeys } from '@/shared/constants/query-keys';
useQuery({ queryKey: queryKeys.loads.list(params), queryFn: … });
qc.invalidateQueries({ queryKey: queryKeys.loads.root });
```

```ts
// WRONG — local constant; invalidation elsewhere won't match
const LOADS_KEY = ['loads'] as const;
useQuery({ queryKey: LOADS_KEY, … });
```

Pattern per entity in the factory:

- `root: ['x']`
- `list(params): ['x', params]`
- `detail(id): ['x', id]`
- Sub-keys, e.g. `charges(id): ['x', id, 'charges']`

## Responsive design

**Rule:** mobile-first Tailwind. Default classes target mobile; add `md:`, `lg:`, `xl:` for larger viewports. Test at:

- **375 px** (mobile)
- **768 px** (tablet)
- **1440 px** (desktop)

…in both themes. Minimum touch target: **44 × 44 px**.

```tsx
// CORRECT — mobile-first
<div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">

// WRONG — desktop-first; mobile becomes awkward overrides
<div className="grid grid-cols-3 max-md:grid-cols-1">
```

## Testing policy

`apps/web/` and `apps/console/` do **not** have working Jest unit tests — the config is misconfigured (per CLAUDE.md memory). Web is gated on:

- `pnpm type-check`
- `pnpm build`
- Browser tests under `tests/browser/` (Playwright, `@sally/qa` workspace)

Don't add `*.test.tsx` files in the web app expecting them to run. Write a browser test instead — see [QA → Writing Tests](../qa/writing-tests.md).

## Review checklist

- [ ] All interactive elements use `@sally/ui` components.
- [ ] No standalone light-only colors (always semantic tokens OR explicit dark variant).
- [ ] Forms with 4+ fields use `FormSheet`, not `Dialog`.
- [ ] Destructive actions use `AlertDialog`.
- [ ] Every mutation has both `showSuccess()` and `showError()`.
- [ ] Every `isLoading` state shows a `<Skeleton>` (not spinner, not `null`).
- [ ] Button loading uses the `loading` prop, not manual `<Loader2>`.
- [ ] Sheets derive list-row data from the query cache via `useMemo`.
- [ ] List → detail transitions prefetch on hover.
- [ ] Query keys imported from `shared/constants/query-keys.ts`, not local constants.
- [ ] Responsive classes for 375 / 768 / 1440 in both themes.
- [ ] `useRouter` imported from `@bprogress/next/app` for navigation (not `next/navigation`).
