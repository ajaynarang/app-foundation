---
title: Frontend Guide
description: How-to guides for building on the SALLY Next.js frontend — routing, feature modules, state, UI standards.
---

# Frontend Guide

Practical guides for `apps/web/` and `apps/console/`. Deeper architectural context lives in [Architecture → Frontend](../architecture/frontend.md).

## Contents

| Page | When you need it |
|---|---|
| [App Router](app-router.md) | Adding a new route, layout, or route group |
| [Feature Modules](feature-modules.md) | Adding a new feature folder under `apps/web/src/features/` |
| [State Management](state-management.md) | Choosing between TanStack Query, Zustand, and component state |
| [UI Standards](../standards/frontend.md) | The non-negotiable UI rules — dark theme, Shadcn-only, Sheet vs Dialog, FormSheet, the 5-layer loading model |

## Hard rules

Code review will catch these. They block PRs.

- **Dark theme support always.** Never standalone `bg-white`, `text-gray-900`, etc. Use the semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`) or always include the dark variant when you have to use a raw color.
- **`@sally/ui` components only.** Never plain `<button>`, `<input>`, `<select>`, `<table>`. Install missing primitives with `npx shadcn@latest add <name>` and re-export from `@sally/ui`.
- **Sheet for 4+ fields, Dialog for fewer, AlertDialog for destructive confirmation.** Use `FormSheet` (from `@/shared/components/ui/form-sheet`) for create/edit/detail views. See [UI Standards](../standards/frontend.md).
- **Every mutation toasts.** Both `showSuccess()` and `showError()` from `@sally/ui`. No silent successes, no silent failures.
- **Every `isLoading` gets a `<Skeleton>`.** Shaped to match the loaded content. Never a spinner, never `null`.
- **Button loading uses `<Button loading={isPending}>`.** Never a manual `<Loader2>` inside a button.
- **Sheets that show list data derive from the query cache** via `useMemo`. Not from a stale prop.
- **List → detail transitions prefetch on hover** with `queryClient.prefetchQuery()`.
- **Responsive at 375/768/1440 in both themes.** Minimum touch target 44×44 px.
- **Centralized query keys.** Import from `apps/web/src/shared/constants/query-keys.ts`. Never define local key constants inside hooks.

## Testing policy

`apps/web/` does not currently have working Jest tests — the config is misconfigured per `CLAUDE.md` memory. **Web is gated on type-check + build + the browser tests under `tests/browser/`** (see [Quality Gate](../qa/index.md)). Don't add `*.test.tsx` files in the web app expecting them to run; they won't.

For backend work, TDD is mandatory. For frontend, write browser tests instead — they catch the things unit tests can't anyway (real DOM, real network, real SSE).

## Running the frontend

```bash
docker-compose up -d                  # postgres + redis + inngest
pnpm doppler:backend                  # NestJS on :8001
pnpm doppler:frontend                 # Next.js web on :3001
pnpm doppler:console                  # Next.js console on :3002

# Or all three in iTerm2 tabs
pnpm dev:side
```

Type-check, lint, build:

```bash
pnpm type-check          # all apps
pnpm lint                # all apps
pnpm build               # all apps
```
