---
title: Frontend Architecture
description: Next.js 15 App Router, feature-module pattern, TanStack Query + Zustand state, SSE real-time, Shadcn UI, the 5-layer loading model.
---

# Frontend Architecture

`apps/web/` is a Next.js 15 application (App Router) built with React 18, Tailwind 3, and the SALLY UI kit. It's the main product surface — dispatcher, driver, customer, and tenant-admin all live here. `apps/console/` is a separate Next.js 15 app for platform / super-admin / API-docs.

## Source layout

```
apps/web/src/
├── app/                    Next.js App Router — routes, layouts, route groups
│   ├── dispatcher/         DISPATCHER + ADMIN surface
│   ├── driver/             DRIVER surface (mobile-shaped)
│   ├── customer/           CUSTOMER portal
│   ├── admin/              Tenant admin
│   ├── (super-admin)/      Route group — SUPER_ADMIN
│   ├── api/                Next.js route handlers (webhook receivers, etc.)
│   ├── sally-canvas/       AI canvas surface
│   ├── sally-default/      AI default chat surface
│   ├── sally-nerve/        Sally's Desk surface (rebrand in flight)
│   ├── agent-actions/      Agent action surface
│   ├── rest-optimizer/     HOS / rest planning surface
│   ├── settings/           Settings (tenant-scoped)
│   ├── login/, register/, accept-invitation/, forgot-password/,
│   │   reset-password/, oauth/, onboarding/, setup-hub/, registration/
│   ├── pricing/, product/, legal/, track/, maintenance/
│   ├── layout.tsx          Root layout — fonts, providers
│   ├── layout-client.tsx   Client wrapper — BProgress ProgressProvider
│   ├── providers.tsx       TanStack Query, SSE, theme, Firebase
│   ├── error.tsx           Route-segment error boundary
│   ├── global-error.tsx    Root error boundary
│   ├── not-found.tsx
│   ├── page.tsx            Root page
│   └── globals.css         Global CSS — pulls in @sally/ui theme tokens
│
├── features/               24 feature folders — components, hooks, api, types, optional store
│   ├── add-ons/, admin-events/, ai/, analytics/, auth/, billing/,
│   │   customer/, desk/, driver/, edi/, email-intake/, feedback/,
│   │   financials/, fleet/, fuel-cards/, home/, horizon/, integrations/,
│   │   operations/, platform/, routing/, support/, system-activity/, webhooks/
│
├── shared/                 Cross-feature utilities
│   ├── components/         Shared components — incl. shared/components/ui/form-sheet.tsx
│   ├── config/             Runtime config
│   ├── constants/          Including query-keys.ts (single source of truth for TanStack Query keys)
│   ├── hooks/              Shared hooks
│   ├── lib/                Shared libs — incl. lib/toast.ts (shim re-exporting from @sally/ui)
│   ├── providers/          Shared React providers
│   ├── realtime/           SSE infrastructure (bus, context, useSseEvent, invalidation map)
│   └── stores/             Shared Zustand stores (sheet-size, etc.)
│
├── components/ui/          App-local UI overrides (otp-input, pin-input)
├── lib/                    App-local libs
└── middleware.ts           Next.js middleware (auth/redirect)
```

`apps/console/src/` follows the same shape, scoped to platform / super-admin / public API docs.

## Route audiences

| Top-level path | Audience | Notes |
|---|---|---|
| `/dispatcher` | DISPATCHER + ADMIN | Main TMS — loads, fleet, billing, pay, alerts, command center, Shield, close-out, plans |
| `/driver` | DRIVER | Mobile-shaped — assignments, HOS, messaging |
| `/customer` | CUSTOMER | Customer portal — tracking, documents, invoices |
| `/admin` | tenant ADMIN | Tenant management |
| `/(super-admin)` | SUPER_ADMIN | Platform admin (route group) |
| `/sally-nerve` | DISPATCHER (varies) | Sally's Desk — the rebrand from "Nerve Center" is in flight; route name still reflects the old terminology |
| `/sally-canvas`, `/sally-default` | DISPATCHER (varies) | AI assistant surfaces |
| `/track` | public | Customer-facing load tracking by share link |

## State management

Three layers, each with one purpose:

- **TanStack Query (server state)** — every backend round-trip. Keys are namespaced through the central factory at `apps/web/src/shared/constants/query-keys.ts`. **Hooks never define local query-key constants** — they import from the factory.
- **Zustand (client state)** — state that lives across pages, like sheet sizing or the auth flag. One shared store (`shared/stores/sheet-size.store.ts`, persisted to localStorage via `zustand/middleware`) plus feature-scoped stores in 7 features (`auth`, `desk`, `platform/{settings,sally-ai,tour,onboarding}`, `routing/optimization`).
- **Component state** — ephemeral UI state (form drafts, hover, expand/collapse). Stays local with `useState`.

See [Frontend → State Management](../frontend/state-management.md) for the worked examples.

## Real-time

The transport is **Server-Sent Events**, not WebSockets — see [ADR-007 Real-Time Architecture](adrs/007-realtime-socketio.md), amended March 2026.

- Server: backend exposes an SSE endpoint that streams `DomainEvent`s relevant to the requester's tenant.
- Client: `EventSource` opens once per tab, brokered by the SSE provider stack under `apps/web/src/shared/realtime/`.
- The provider stack: `sse-provider.tsx` → `sse-connection-context.tsx` → `sse-context.tsx` → `sse-bus.ts` (in-memory bus). Components subscribe via the `useSseEvent` hook.
- An **invalidation map** (`shared/realtime/invalidation-map.ts`) routes incoming event names to TanStack Query cache invalidations — so a `load.updated` event triggers `queryKeys.loads.detail(id)` invalidation automatically.
- Bidirectional messaging (dispatcher ↔ driver chat) retains Socket.IO — that's the one place where genuine two-way push is needed. SSE handles the rest.

## UI kit

`@sally/ui` (`packages/ui/src/`) is the canonical home:

- **Shadcn primitives** — `button`, `card`, `dialog`, `alert-dialog`, `sheet`, `table`, `tabs`, `accordion`, `popover`, `tooltip`, `calendar`, `command`, `progress`, `radio-group`, `scroll-area`, `slider`, `switch`, `toggle-group`, `avatar`, `badge`, `alert`, `separator`, `label` (and more).
- **Sally extensions** — `form-sheet`, `sheet-section`, `sally-insight`, `info-item`, `url-row`, `phone-input`, `copy-button`.
- **Toast utility** — `showSuccess`, `showError`, `showLoading`, `dismissToast`, `showMutationError`, `toast` exported from `@sally/ui` (with a backward-compat re-export in `apps/web/src/shared/lib/toast.ts`).
- **Theme tokens** — `packages/ui/src/styles/globals.css` defines the CSS variables for the palette (see [Standards → Colors](../standards/platform.md#color-palette-semantic-tokens-only)).

App-local overrides live in `apps/web/src/components/ui/` (currently `otp-input`, `pin-input`) and shared-but-web-specific components in `apps/web/src/shared/components/ui/` (notably `form-sheet.tsx`, which extends the `@sally/ui` base with rich-title support and persisted sheet sizing).

See [Frontend → UI Standards](../standards/frontend.md) for the rules — dark theme, dialog-vs-sheet, FormSheet usage, the 5-layer loading model.

## The 5-layer loading model

Every page should provide loading feedback at the layers that apply. From `CLAUDE.md` "UI Development Standards":

| Layer | Implementation | When |
|---|---|---|
| L1 — Top progress bar | `@bprogress/next/app` via `ProgressProvider` in `layout-client.tsx`. Use `useRouter` from `@bprogress/next/app` for navigation. | Route transitions |
| L2 — Button loading | `<Button loading={isPending}>` from `@sally/ui`. NOT manual `Loader2`. | Mutations |
| L3 — Toast | `showSuccess()` AND `showError()` from `@sally/ui` on every mutation. Both required. | Every mutation |
| L4 — Skeleton | `<Skeleton>` from `@sally/ui`, matching the layout of the loaded content. NOT a spinner, NOT `null`. | Every `isLoading` state |
| L5 — Optimistic update | TanStack Query `onMutate` cache mutation; `onError` rollback. | Low-risk toggles |

Two adjacent rules that are easy to miss:

- Sheets that show list data **must derive from the query cache via `useMemo`**, not from stale local state passed in as a prop.
- List → detail transitions **must `queryClient.prefetchQuery()` on hover**, so the detail sheet opens instantly.

## Responsive design

Mobile-first. Tailwind classes default to mobile and add `md:`, `lg:`, `xl:` for larger viewports. Test at **375 px** (mobile), **768 px** (tablet), **1440 px** (desktop) — in both themes. Minimum touch target: **44×44 px**.

## Authentication

Firebase Authentication on the frontend; the Firebase ID token is sent to the backend as a bearer JWT. The backend verifies it on every request via `AuthGuard`. Multi-tenant resolution happens server-side from the user's tenant membership.

## Tests

- **Unit tests** — `apps/web/` does NOT currently have working unit tests. Per `CLAUDE.md` memory, Jest is misconfigured (`--passWithNoTests` masks it). Web gates on type-check + build + browser tests.
- **Browser tests** — in `tests/browser/` (the `@sally/qa` workspace), run via `pnpm test:browser:local`. See [Quality Gate → Writing Tests](../qa/writing-tests.md).

## Deployment

Web and console deploy to Vercel via deploy hooks invoked from the GitHub Actions `Deploy Frontend` workflow. `vercel.json` has `deploymentEnabled: false` — git-push auto-deploy is intentionally disabled. Each Vercel project (`sally-web`, `sally-console`) has staging and production deploy hooks; the workflow picks the right one based on the environment input.
