---
title: App Router
description: How Next.js 15 App Router is structured in apps/web/, the audience-keyed top-level surfaces, layouts, and the in-flight sally-nerve → sally-desk rename.
---

# App Router

`apps/web/` uses Next.js 15 App Router. Routes live under `apps/web/src/app/`. Each top-level folder corresponds to either an audience (dispatcher, driver, customer, admin, super-admin) or a cross-cutting surface (auth, AI, settings, marketing).

## Top-level layout

```
apps/web/src/app/
├── layout.tsx               Root layout — fonts, html/body shell
├── layout-client.tsx        Client wrapper — wraps in <ProgressProvider> from @bprogress/next
├── providers.tsx            React provider stack — QueryClient, ThemeProvider, SSE, Firebase
├── page.tsx                 Root page — currently redirects based on role
├── error.tsx                Route-segment error boundary
├── global-error.tsx         Root error boundary
├── not-found.tsx
├── globals.css              Imports @sally/ui theme tokens
│
├── dispatcher/              DISPATCHER + ADMIN — main TMS surface
├── driver/                  DRIVER — mobile-shaped
├── customer/                CUSTOMER — customer portal
├── admin/                   tenant ADMIN
├── (super-admin)/           SUPER_ADMIN — route group
│
├── api/                     Next.js route handlers (webhooks, etc.)
│
├── sally-canvas/            AI canvas chat
├── sally-default/           AI default chat
├── sally-nerve/             Sally's Desk (rebrand in flight — see below)
├── agent-actions/           Agent action surface
├── rest-optimizer/          HOS / rest planning
│
├── login/                   Auth surfaces
├── register/
├── registration/
├── accept-invitation/
├── forgot-password/
├── reset-password/
├── oauth/
├── onboarding/
├── setup-hub/
│
├── pricing/                 Public marketing
├── product/
├── legal/
├── track/                   Public load tracking by share link
│
├── settings/                Tenant-scoped settings (route group + nested layouts)
└── maintenance/             Maintenance mode page
```

## Audience model

The web app serves five roles from a single Next.js project. Each audience has its own top-level folder with a per-segment layout (auth gate, navigation chrome, theme defaults). A user lands on the right folder based on their role — the root `page.tsx` performs the redirect.

| Folder | Role(s) | Layout |
|---|---|---|
| `dispatcher/` | DISPATCHER, ADMIN | Sidebar + top bar, dense desktop chrome |
| `driver/` | DRIVER | Mobile-first; minimal chrome |
| `customer/` | CUSTOMER | Customer portal chrome |
| `admin/` | tenant ADMIN | Tenant management chrome |
| `(super-admin)/` | SUPER_ADMIN | Platform admin — route group, no URL segment |

`(super-admin)` is a Next.js **route group** — the parentheses tell Next not to include it in the URL. Pages under `(super-admin)/whatever/` are reachable at `/whatever/` for users with that role.

## In-flight rename: `sally-nerve` → `sally-desk`

The current production route name for what we call "Sally's Desk" is `sally-nerve`. The rename to `sally-desk` is in flight; both names refer to the same surface today. Don't proactively rename the folder in a small PR — it touches a lot. When you work in this folder, use the existing name and reference [Architecture → Sally's Desk](../architecture/sally-desk.md) for the vocabulary.

## Adding a new page

1. **Pick the audience folder.** A new dispatcher page goes under `dispatcher/`; a new driver page under `driver/`.

2. **Create the route file.** Next.js conventions: `page.tsx` is the page, `layout.tsx` is the wrapping layout, `loading.tsx` is the Suspense fallback, `error.tsx` is the route-segment error boundary.

    ```
    apps/web/src/app/dispatcher/my-new-page/
    ├── page.tsx
    ├── loading.tsx       (optional but recommended — show a Skeleton, not a spinner)
    └── error.tsx         (optional — defaults to inherited boundary)
    ```

3. **Use `useRouter` from `@bprogress/next/app`**, NOT from `next/navigation`. The BProgress wrapper hooks into route transitions to show the top progress bar (the L1 loading layer — see [UI Standards](../standards/frontend.md)).

    ```tsx
    'use client';
    import { useRouter } from '@bprogress/next/app';

    export default function MyPage() {
      const router = useRouter();
      // ...
      return <Button onClick={() => router.push('/dispatcher/loads')}>Back to loads</Button>;
    }
    ```

4. **Auth gate** is handled by the per-audience layout above your route. You don't need to add a per-page auth check in most cases.

5. **Add the route to navigation.** The dispatcher sidebar is built from a navigation config — find it under `apps/web/src/features/platform/` or the dispatcher layout and add the entry.

## Layouts

Per-segment layouts wrap pages with shared chrome. Children render via the `children` prop. Common patterns observed in the codebase:

- **Audience layout** (`dispatcher/layout.tsx`, `driver/layout.tsx`): provides the sidebar / top bar, applies the auth gate, sets theme defaults.
- **Sub-area layout** (`settings/layout.tsx`): provides the settings nav, inherits chrome from the audience layout above it.
- **Page-level layout**: rare — usually a page provides its own content and relies on inherited layouts.

Avoid creating deep layout nesting. If you find yourself reaching for a third layout level, ask whether the chrome you're trying to share belongs in a shared component instead.

## Loading states

Every async page should provide a `loading.tsx` next to its `page.tsx`. Use `<Skeleton>` from `@sally/ui` to match the loaded content's shape — NOT a spinner.

```tsx
// app/dispatcher/loads/loading.tsx
import { Skeleton } from '@sally/ui';

export default function LoadsLoading() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
```

This complements the L1 progress bar (BProgress) — the bar fires immediately on `router.push`, the loading.tsx Skeleton fills in once the new segment is being rendered.

## Server Components vs Client Components

The default is Server Components. Mark a file `'use client'` only when you need:

- Browser APIs (`window`, `document`, etc.).
- React state / effects.
- Event handlers.
- Third-party libraries that use the above.

The product is heavy on Client Components (most pages are interactive), but the `app/` folder root files and many layouts are Server Components. Don't add `'use client'` to files that don't need it — Server Components are faster and ship less JS.

## Route handlers (`app/api/`)

`apps/web/src/app/api/` holds Next.js route handlers — typically for webhook receivers that need to live on the Vercel edge, or for endpoints that should be co-located with the frontend (e.g. NextAuth-style callbacks). The main API surface is the backend at `:8001`; these handlers are the exception, not the rule.

## Adding a new top-level audience

Rare. Talk to the team first — a new top-level audience implies a new role, which has knock-on effects on RBAC, the backend, and the tests.
