---
owner: foundation
sources:
  - apps/web/src/app/layout.tsx
  - apps/web/src/app/providers.tsx#Providers
  - apps/web/src/middleware.ts#PROTECTED_PREFIXES
  - packages/appshore/web-core/src/shared/lib/navigation.ts#protectedRoutePatterns
  - packages/appshore/web-core/src/auth/session-bridge.ts#registerSessionStore
  - apps/web/src/features/auth/store.ts#useAuthStore
  - apps/web/src/features/platform/feature-flags/components/FeatureGuard.tsx#FeatureGuard
  - apps/web/src/features/platform/api-keys/index.ts
  - packages/appshore/web-core/src/shared/constants/storage-keys.ts#STORAGE_KEYS
  - packages/ui/src/components/ui/status-tone.ts#variantOf
  - packages/ui/src/components/ui/button.tsx
  - packages/ui/src/lib/toast.ts#showMutationError
  - apps/web/src/shared/providers/PreferencesProvider.tsx#useFormatters
  - apps/web/src/shared/providers/PageChromeBridge.tsx
  - apps/web/src/shared/components/command-palette/CommandPalette.tsx
  - apps/web/eslint.config.mjs
guards:
  - foundation-boundaries.spec.ts
  - single-component-set.test.ts
  - ui-grammar-guard.test.ts
  - theme-tokens.test.ts
  - lint:no-restricted-syntax
  - gate:raw-control
  - gate:file-size
examples:
  - AppContext
  - dehydrate
  - HydrationBoundary
  - formatDistanceToNow
---

# Frontend core: app structure, components, constants, utilities, routes, auth, providers, `@app/ui`

How the web app is put together and where a new screen's code goes. Data (the API layer, query hooks, SSE, URL
state) is in [`frontend-data.md`](frontend-data.md); lists in [`frontend-lists.md`](frontend-lists.md); forms,
sheets and the error layers in [`forms-and-sheets.md`](forms-and-sheets.md); page chrome, theme and copy in
[`ui-grammar.md`](ui-grammar.md). The React long form of the size and naming rules is in
[`code-quality.md`](code-quality.md).

## Layout

```
apps/web/src/
  app/                    Next.js App Router pages, error boundaries, providers.tsx, layout.tsx
  features/               one folder per feature: api.ts, hooks/, components/, index.ts (constants.ts, types.ts)
    auth/  billing/  ai/  admin/  webhooks/  notifications/
    platform/             settings, plans, feature-flags, api-keys, workspaces, onboarding, ai-chat, …
    <your-feature>/
  shared/                 components/ (page-chrome/, layout/, common/, command-palette/), providers/, hooks/, lib/
  middleware.ts           route presence and role redirects, tenant subdomain, maintenance page
packages/appshore/web-core/src/   @appshore/web-core: api client, error utils, query keys and tiers, storage keys,
                                  realtime (SSE), the list kit, hooks; source-consumed through tsconfig paths
packages/ui/src/                  @app/ui: the shadcn set, page chrome, status tones, toasts, FormSheet, preset
packages/shared-types/src/        @app/shared-types: Zod schemas and the generated Prisma enum mirror
```

`apps/web/src/features/platform/api-keys/` is the reference feature folder: `api.ts`, `hooks/`, `components/` and an
`index.ts` that exports the hooks, the API object and the types.

## Rules

### Structure and layers

- A product feature is a folder under `apps/web/src/features/<your-feature>/` with `api.ts`, `hooks/`, `components/`
  and an `index.ts`; other features import it through its `index.ts`. [review-only: no spec reads folder shape]
- Layers point one way: `kernel ← web-core ← web`. `@appshore/web-core` never imports app code; it reads the session
  through the session bridge (`registerSessionStore`, called by the app's auth store). `@app/ui` imports no
  `@appshore/*`, no `@/`, no `next` and no app code: what the page chrome needs from the app is passed once by
  `PageChromeBridge`. [guard: foundation-boundaries.spec.ts]
- A shadcn component is imported from `@app/ui/components/ui/<name>` and from nowhere else. A missing component or a
  new behaviour is added in `packages/ui/src/components/ui/`, never copied into the app.
  [guard: single-component-set.test.ts]
- No raw `<button>` or `<input>` in web features: `Button`, `Input` and the rest from `@app/ui`. A navigating action is
  `<Button asChild><Link href="…">…</Link></Button>`. [guard: gate:raw-control]
- A web `.tsx` over 300 lines fails the gate; aim for 150. [guard: gate:file-size]

### Components

- `'use client'` on every interactive component, pushed as far down the tree as it goes. [review-only: needs reading]
- A feature-flagged or plan-gated surface renders inside `FeatureGuard` (`featureKey` or `entitlementKey`), which
  renders nothing or the upgrade prompt when the feature is off. [review-only: no spec finds an ungated surface]
- Prop drilling is fine two levels deep. A value passed through three or more components that do not use it moves to
  a feature-scoped context (one per detail tree, with a hook that throws outside its provider); never a global
  `AppContext` in `shared/`. [review-only: needs reading]
- A heavy dependency (PDF, map, chart, editor) loads with `next/dynamic`, `ssr: false` when it touches `window`, and a
  `loading` fallback the size of the final component; lazy-load at a component boundary, not inside a `useEffect`.
  [review-only: no spec measures bundle weight]
- Authenticated pages are Client Components: the data is interactive and SSE-driven. A Server Component is for a
  public page, a mostly read-only settings page, or a wrapper that prefetches the first page into the query client
  with `dehydrate` and `HydrationBoundary`; never for a view that needs SSE, mutations or a user-controlled tab.
  [review-only: needs judgement]

### Constants and status maps

- Query keys come from `queryKeys` in `packages/appshore/web-core/src/shared/constants/query-keys.ts`
  ([`frontend-data.md`](frontend-data.md)); browser storage keys come from `STORAGE_KEYS` in
  `packages/appshore/web-core/src/shared/constants/storage-keys.ts`. Never an inline key. [review-only: no spec scans
  for inline keys]
- A status maps to a tone, never to a class string: a `Record<Enum, StatusVariant>` in the feature's `constants.ts`,
  rendered with `StatusBadge`. Read it with `variantOf(MAP, value)` (an unknown value reads as a neutral label, not a
  crash) and build filter options with `variantOptions(MAP)`. Every status map is listed in `STATUS_MAPS` of
  `apps/web/src/features/__tests__/ui-grammar-guard.test.ts`, which fails when one label wears two tones.
  [guard: ui-grammar-guard.test.ts]
- The six tones: `neutral` not started, `info` moving, `warning` waiting on a person, `success` done well, `danger`
  stopped, `muted` retired. A role or a category is not a status: `<Badge variant="outline">`.
  [guard: ui-grammar-guard.test.ts]
- Tinted text wears the `-text` token (`text-info-text`, `text-caution-text`, `text-success-text`,
  `text-critical-text`); the fill hues are for fills and icons. A product's brand colour is `--brand` and
  `--brand-text` in `packages/ui/src/styles/globals.css`, nowhere else. [guard: theme-tokens.test.ts,
  ui-grammar-guard.test.ts]
- Select options are typed constants at the top of the file or in `constants.ts`, valued from the shared enum, never
  an inline array in JSX. [review-only: needs reading]
- No magic strings: a status, role or event compares against the shared enum or constant (`UserRole.ADMIN`,
  `SSE_EVENTS.NOTIFICATION_NEW`), then a centralized constant (`queryKeys`, `QUERY_TIERS`, `STORAGE_KEYS`), then a
  feature `constants.ts`, then a named file-level `const`. API paths, toast copy and Tailwind classes are not domain
  tokens. [review-only: only status casing is spec-checked, by web-status-casing.spec.ts]

### Shared utilities

- Never duplicate a utility: `showSuccess` and `showError` and `cn()` from `@app/ui`; `apiClient` from
  `@appshore/web-core/shared/lib/api`; `extractErrorMessage` and `extractFieldErrors` from
  `@appshore/web-core/shared/lib/error-utils`. A new shared helper goes in web-core or `apps/web/src/shared/`, not in
  a feature. [review-only: no spec finds a copied helper]
- A user-facing date or time goes through `useFormatters()` from `@/shared/providers/PreferencesProvider`
  (`formatDate`, `formatTime`, `formatDateTime`, `formatTimestamp`), which applies the user's format, clock and
  timezone; lint bans `toLocaleDateString` and `toLocaleTimeString` outside the maintenance page. `toLocaleString`
  on a date is the same mistake. [guard: lint:no-restricted-syntax]
- A relative time is `<RelativeTime iso={…} />` from the page chrome ("5m ago", full timestamp on hover), never a
  bare `formatDistanceToNow` or `timeAgo` on screen. [guard: ui-grammar-guard.test.ts]

### Routes, auth and the provider stack

- `apps/web/src/middleware.ts` is a convenience, not a security boundary: it reads the auth and role
  presence cookies (set client-side, so spoofable), redirects a wrong role to its default route, resolves the tenant
  subdomain when `NEXT_PUBLIC_MULTI_TENANT` is on, and serves the maintenance page. The backend's guards enforce
  access. [review-only: needs reading]
- A new protected route prefix goes in both `PROTECTED_PREFIXES` (middleware) and `protectedRoutePatterns`
  (`packages/appshore/web-core/src/shared/lib/navigation.ts`); the two lists must match.
  [review-only: no test compares the two lists yet]
- Sign-in is first-party email and password (`useAuthStore.signIn`), with Firebase and phone OTP optional. The backend
  returns the access token and sets the httpOnly refresh cookie; the store keeps `accessToken` and `user`, the
  session bridge hands them to the API client and the SSE provider, and a 401 refreshes once through the cookie, with
  concurrent 401s sharing one refresh. [review-only: needs reading]
- The provider stack is fixed: `ThemeProvider` in `app/layout.tsx`, then `Providers` in `app/providers.tsx`:
  `QueryClientProvider` → `AuthProvider` → `PreferencesProvider` → `PageChromeBridge` → `SseProvider` →
  `TooltipProvider`. The Sonner `Toaster` and `NetworkStatusBanner` sit in the layout. A new app-wide provider goes
  into that order on purpose, not at the top. [review-only: needs reading]
- The query client's defaults live once in `providers.tsx`: a two-minute `staleTime` (SSE invalidation is the
  real-time path), `refetchOnWindowFocus` off, one query retry, no mutation retry, and a `MutationCache` fallback
  that shows an error toast (or the plan upgrade prompt) only for a mutation with no `onError` of its own.
  [review-only: needs reading]

### `@app/ui` and the command palette

- `@app/ui` exports `cn()`, the toasts (`showSuccess`, `showSuccessWithLink`, `showSuccessWithAction` for one action
  the person can take back, `showWarning` for done-with-a-caveat, `showError`, `showMutationError`), the shadcn set,
  the page chrome and list components, `StatusBadge` and the tones, `FormSheet` and the Tailwind preset. Use these
  before writing a component. [guard: single-component-set.test.ts]
- The command palette (`apps/web/src/shared/components/command-palette/`, Cmd+K or Ctrl+K) is global: navigate
  anywhere and search. A page's own actions go in its `PageActionsMenu`, never in the palette.
  [review-only: needs reading]

## Recipe: add a feature folder

Copy the shape of `apps/web/src/features/platform/api-keys/`:

1. `api.ts`: one object of calls over `apiClient`, typed with `@app/shared-types` (see
   [`frontend-data.md`](frontend-data.md)).
2. `hooks/use-<thing>.ts`: the read hook (`useCursorList` for a growing list) and one mutation hook per write, each
   with a success and an error toast.
3. Add the feature's namespace to `queryKeys` (a `root`, and distinct `list` and `detail` segments).
4. `components/`: the page body (page chrome from `@/shared/components/page-chrome`, see [`ui-grammar.md`](ui-grammar.md))
   and its sheets ([`forms-and-sheets.md`](forms-and-sheets.md)).
5. `constants.ts`: status maps (add each to `STATUS_MAPS`) and select options.
6. `index.ts`: export the hooks, the API object and the types other features may use.
7. The route under `apps/web/src/app/`; add a protected prefix to both route lists if it is a new top-level path.
8. Run `pnpm --filter @app/web test`, `pnpm --filter @app/web type-check` and `pnpm --filter @app/web lint`.

## Flag in review

- A `<div onClick>` with no keyboard support: use `Button`, or add `role="button"`, `tabIndex={0}` and `onKeyDown`.
- A heavy library imported at the top level of a page.
- `as any` to get past a type: fix the type in `@app/shared-types`.
- `console.error` used as error tracking: `captureError()` from `@appshore/web-core/shared/lib/sentry`.
- A context created for a value passed one level down, or a global context in `shared/`.
- A new provider added at the top of the stack without a reason.
- A route prefix added to one of the two protected lists only.
