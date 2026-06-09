# Frontend Architecture - the platform Web App

**Last Updated:** February 5, 2026
**Architecture:** Domain-Driven Design (DDD) with Feature-Sliced Architecture

---

## Overview

The frontend mirrors the backend's domain structure for consistency and developer experience. We use a hybrid architecture:

- **`features/`** - Domain-aligned business logic (mirrors backend domains)
- **`app/`** - Next.js App Router pages (route-based organization)
- **`shared/`** - Cross-cutting concerns and utilities

---

## Directory Structure

```
apps/web/src/
├── app/                          # Next.js 15 App Router (route-based pages)
│   ├── (dashboard)/             # Dashboard layout group
│   ├── (super-admin)/           # Admin layout group
│   ├── dispatcher/              # Dispatcher role pages
│   ├── driver/                  # Driver role pages
│   ├── settings/                # Settings pages
│   └── layout.tsx               # Root layout
│
├── features/                    # Domain-aligned feature modules
│   │
│   ├── auth/                    # Authentication (top-level domain)
│   │   ├── api.ts              # Auth API client
│   │   ├── types.ts            # Auth types
│   │   ├── hooks/              # React Query hooks
│   │   │   └── use-auth.ts    # useAuth hook
│   │   ├── components/         # Auth UI components
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── login-form.tsx
│   │   │   └── registration-form.tsx
│   │   ├── store.ts            # Zustand store for auth state
│   │   ├── __tests__/          # Auth tests
│   │   └── index.ts            # Barrel export
│   │
│   ├── integrations/            # Integrations (top-level domain)
│   │   ├── api.ts              # Integrations API
│   │   ├── components/         # Integration components
│   │   └── index.ts
│   │
│   ├── fleet/                   # Fleet Management Domain
│   │   ├── drivers/
│   │   │   ├── api.ts          # driversApi + legacy exports
│   │   │   ├── types.ts        # Driver, CreateDriverRequest, etc.
│   │   │   ├── hooks/
│   │   │   │   └── use-drivers.ts  # useDrivers, useCreateDriver, etc.
│   │   │   ├── components/
│   │   │   │   ├── driver-list.tsx
│   │   │   │   └── driver-activation-dialog.tsx
│   │   │   └── index.ts
│   │   ├── vehicles/
│   │   │   ├── api.ts
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   └── index.ts
│   │   └── loads/
│   │       ├── api.ts
│   │       ├── types.ts
│   │       ├── hooks/
│   │       ├── components/
│   │       └── index.ts
│   │
│   ├── routing/                 # Routing Domain
│   │   ├── route-planning/
│   │   │   ├── api.ts          # routePlanningApi + legacy exports
│   │   │   ├── types.ts        # RoutePlan, triggers, etc.
│   │   │   ├── hooks/
│   │   │   │   ├── use-route-planning.ts
│   │   │   │   └── useRoutePlanning.ts  # Store-based hooks
│   │   │   ├── components/     # 40+ planning components
│   │   │   │   ├── core/
│   │   │   │   ├── costs/
│   │   │   │   ├── driver/
│   │   │   │   ├── overview/
│   │   │   │   ├── route/
│   │   │   │   └── shared/
│   │   │   ├── store.ts        # Route planning Zustand store
│   │   │   └── index.ts
│   │   ├── optimization/
│   │   │   ├── api.ts          # optimizationApi + legacy
│   │   │   ├── types.ts        # REST optimization types
│   │   │   ├── hooks/
│   │   │   │   ├── use-optimization.ts
│   │   │   │   └── useEngineRun.ts
│   │   │   ├── store.ts        # Engine store
│   │   │   └── index.ts
│   │   └── hos-compliance/
│   │       ├── api.ts          # hosComplianceApi + legacy
│   │       ├── types.ts
│   │       ├── hooks/
│   │       └── index.ts
│   │
│   ├── operations/              # Operations Domain
│   │   ├── alerts/
│   │   │   ├── api.ts
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   ├── components/
│   │   │   └── index.ts
│   │   └── monitoring/
│   │       └── (existing structure)
│   │
│   └── platform/                # Platform Domain
│       ├── preferences/
│       │   ├── api.ts          # User, operations, driver preferences
│       │   ├── types.ts
│       │   ├── hooks/
│       │   ├── components/
│       │   ├── store.ts
│       │   └── index.ts
│       ├── feature-flags/
│       │   ├── api.ts
│       │   ├── types.ts
│       │   ├── hooks/
│       │   │   └── use-feature-flags.ts  # React Query hooks ONLY
│       │   ├── components/
│       │   │   ├── ComingSoonBanner.tsx
│       │   │   └── FeatureGuard.tsx
│       │   └── index.ts
│       ├── onboarding/
│       │   ├── api.ts
│       │   ├── types.ts
│       │   ├── hooks/
│       │   ├── components/
│       │   ├── store.ts
│       │   └── index.ts
│       ├── users/
│       │   └── (existing structure)
│       ├── admin/
│       │   ├── components/
│       │   │   └── tenant-list.tsx
│       │   └── index.ts
│       └── chat/
│           ├── components/
│           │   ├── Floatingthe platformButton.tsx
│           │   ├── Globalthe platformChat.tsx
│           │   └── the platformChatPanel.tsx
│           ├── store.ts
│           └── index.ts
│
├── shared/                      # Shared utilities and components
│   ├── components/
│   │   ├── ui/                 # 28 Shadcn UI components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── ... (25 more)
│   │   ├── layout/             # Layout components
│   │   │   ├── AppLayout.tsx
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── AppHeader.tsx
│   │   │   └── ... (5 more)
│   │   └── common/             # Shared common components
│   │       ├── ThemeProvider.tsx
│   │       ├── dashboard/      # Dashboard widgets
│   │       ├── landing/        # Landing page components
│   │       └── providers/      # App-wide providers
│   │
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── index.ts
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts       # Base API client
│   │   │   ├── external.ts     # Mock external APIs
│   │   │   ├── scenarios.ts    # Test scenarios
│   │   │   └── scenarios-types.ts
│   │   ├── utils/
│   │   │   ├── cn.ts           # Tailwind class merging
│   │   │   ├── formatters.ts   # Date/number formatters
│   │   │   ├── validation.ts   # Validation utilities
│   │   │   └── index.ts
│   │   ├── validation/
│   │   │   ├── schemas.ts      # Zod schemas
│   │   │   └── index.ts
│   │   ├── firebase.ts
│   │   └── navigation.ts
│   │
│   ├── config/
│   │   └── comingSoonContent.ts
│   │
│   └── types/
│       └── (shared type definitions)
│
└── styles/
    └── globals.css
```

---

## Architecture Principles

### 1. Domain Alignment

**Frontend domains mirror backend domains:**

| Frontend Feature                  | Backend Domain                   | Purpose                        |
| --------------------------------- | -------------------------------- | ------------------------------ |
| `features/auth`                   | `auth/`                          | Authentication & authorization |
| `features/integrations`           | `domains/platform/integrations`  | External system integrations   |
| `features/fleet/drivers`          | `domains/fleet/drivers`          | Driver management              |
| `features/fleet/vehicles`         | `domains/fleet/vehicles`         | Vehicle fleet                  |
| `features/fleet/loads`            | `domains/fleet/loads`            | Load management                |
| `features/routing/route-planning` | `domains/routing/route-planning` | TSP/VRP optimization           |
| `features/routing/optimization`   | `domains/routing/optimization`   | REST optimization              |
| `features/routing/hos-compliance` | `domains/routing/hos-compliance` | HOS validation                 |
| `features/operations/alerts`      | `domains/operations/alerts`      | Dispatcher alerts              |
| `features/platform/preferences`   | `domains/platform/preferences`   | User settings                  |

### 2. Feature Module Pattern

**Each feature follows a consistent structure:**

```typescript
feature-name/
├── api.ts           // API client (object pattern: featureApi)
├── types.ts         // TypeScript types
├── hooks/           // React Query + custom hooks
├── components/      // Feature-specific components
├── store.ts         // Zustand store (if needed)
├── __tests__/       // Feature tests
└── index.ts         // Barrel export (public API)
```

**Barrel Export Pattern:**

```typescript
// features/fleet/drivers/index.ts

// API
export {
  driversApi, // Modern: object with methods
  listDrivers, // Legacy: direct function (backwards compat)
  getDriver,
  createDriver,
  // ... more legacy exports
} from './api';

// Types
export type { Driver, CreateDriverRequest, UpdateDriverRequest } from './types';

// Hooks
export { useDrivers, useDriverById, useCreateDriver } from './hooks/use-drivers';

// Components
export { default as DriverList } from './components/driver-list';
```

### 3. Data Fetching Strategy

**React Query for ALL server state:**

- ✅ Feature flags: React Query hooks only (removed duplicate Zustand store)
- ✅ Drivers, vehicles, loads: React Query
- ✅ Routes, HOS, optimization: React Query
- ✅ Alerts, preferences: React Query

**Zustand for UI/client state only:**

- Auth state (user session, tokens)
- Route planning form state
- Chat panel state (open/closed)
- Onboarding progress

**Why this matters:**

- React Query handles caching, refetching, synchronization
- Zustand only for ephemeral UI state
- No duplication of server data

### 4. Import Paths

**TypeScript path aliases:**

```typescript
// Feature imports
import { useDrivers, DriverList } from '@/features/fleet/drivers';
import { useAuth } from '@/features/auth';
import { optimizationApi } from '@/features/routing/optimization';

// Shared imports
import { Button, Card } from '@/shared/components/ui';
import { AppLayout } from '@/shared/components/layout';
import { cn } from '@/shared/lib/utils';
import { useToast } from '@/shared/hooks';

// App imports (rare - usually features are consumed, not app)
import { metadata } from '@/app/layout';
```

### 5. Backwards Compatibility

**Legacy function exports for gradual migration:**

```typescript
// Old code (still works)
import { listDrivers, createDriver } from '@/features/fleet/drivers';
const drivers = await listDrivers();

// New code (recommended)
import { driversApi } from '@/features/fleet/drivers';
const drivers = await driversApi.list();
```

Both work during transition. Eventually remove legacy exports.

---

## Component Organization

### UI Components (`shared/components/ui/`)

**28 Shadcn UI components** - Design system foundation

All imports use: `@/shared/components/ui`

```typescript
import { Button, Card, Input, Label } from '@/shared/components/ui';
```

**DO NOT import from** `@/components/ui` (old path removed)

### Layout Components (`shared/components/layout/`)

**8 layout components** - App-wide layouts

- AppLayout, AppSidebar, AppHeader
- PublicLayout, CommandPalette
- UserProfileMenu

### Common Components (`shared/components/common/`)

**Shared across features:**

- ThemeProvider
- Dashboard widgets (ControlPanel, ResizableSidebar, VisualizationArea)
- Landing page components
- App-wide providers

### Feature Components

**Live in their feature directory:**

```
features/routing/route-planning/components/
├── core/                # Core planning UI
├── costs/               # Cost breakdown
├── driver/              # Driver timeline
├── overview/            # Route overview
├── route/               # Route details
└── shared/              # Shared within route-planning
```

---

## State Management

### React Query (Server State)

**For all API data:**

- Automatic caching with stale-while-revalidate
- Background refetching
- Optimistic updates
- Request deduplication

**Query keys convention:**

```typescript
['feature-flags'][('feature-flags', flagKey)]['drivers'][('drivers', driverId)]['vehicles']; // List // Detail // List // Detail // List
```

### Zustand (Client State)

**For UI/form state only:**

```typescript
// Auth store - session state
features/auth/store.ts
- user, tokens, isAuthenticated

// Route planning store - form state
features/routing/route-planning/store.ts
- stops, driver state, vehicle state, selected scenario

// Chat store - UI state
features/platform/chat/store.ts
- isOpen, isDocked

// Onboarding store - progress tracking
features/platform/onboarding/store.ts
- completed items, current step
```

**Stores export hooks:**

```typescript
export const useAuthStore = create<AuthState>((set) => ({...}));
```

---

## TypeScript Configuration

**Path aliases** (tsconfig.json):

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/features/*": ["./src/features/*"],
      "@/shared/*": ["./src/shared/*"]
    }
  }
}
```

**Strict mode enabled:**

- No implicit any
- Strict null checks
- Strict function types

---

## Testing Structure

**Co-located with features:**

```
features/fleet/drivers/
├── __tests__/
│   ├── api.test.ts
│   ├── hooks.test.ts
│   └── components.test.tsx
```

**Shared test utilities:**

```
shared/lib/test-utils/
├── render.tsx        # Custom render with providers
├── mocks.ts          # Mock data factories
└── server.ts         # MSW server setup
```

---

## Migration Guide

### From Old to New Structure

**Old:**

```typescript
import { listDrivers } from '@/lib/api/drivers';
import { Driver } from '@/lib/types/driver';
import DriverList from '@/components/drivers/driver-list';
```

**New:**

```typescript
import {
  driversApi, // or listDrivers (legacy)
  useDrivers, // React Query hook
  DriverList, // Component
  type Driver, // Type
} from '@/features/fleet/drivers';
```

### Removed Directories

The following have been **removed** and replaced:

- ❌ `src/components/` (except re-exports - now in `shared/components/`)
- ❌ `src/lib/api/` (now in feature `api.ts` files)
- ❌ `src/lib/types/` (now in feature `types.ts` files)
- ❌ `src/lib/hooks/` (now in feature `hooks/` directories)
- ❌ `src/stores/` (now in feature `store.ts` files)
- ❌ `src/hooks/` (moved to `shared/hooks/`)

---

## Key Decisions

### 1. Feature Flags: React Query Only

**Previously:** Duplicate implementations (Zustand store + React Query)
**Now:** React Query only

**Reasoning:**

- React Query provides all needed features (caching, loading, error states)
- Eliminates code duplication
- Better type safety
- Follows same pattern as rest of app
- Simpler mental model

### 2. Auth & Integrations: Top-Level

**Structure:**

```
features/
├── auth/              # NOT platform/auth
├── integrations/      # NOT platform/integrations
└── platform/
    ├── preferences/
    ├── feature-flags/
    └── ...
```

**Reasoning:** Matches backend domain structure exactly

### 3. Shared vs Features

**Shared:**

- UI components (Shadcn)
- Layout components
- Utilities (cn, formatters, validation)
- Hooks used across 3+ features

**Features:**

- Domain-specific logic
- API clients
- Business components
- Domain types

---

## Performance Considerations

### Code Splitting

**Automatic route-based splitting:**

- Each `app/` page is a separate chunk
- Feature components lazy-loaded when needed

**Manual splitting for large features:**

```typescript
const RouteTimeline = lazy(() => import('@/features/routing/route-planning/components/timeline'));
```

### React Query Configuration

**Default settings:**

- `staleTime: 0` - Always refetch on mount
- `cacheTime: 5 minutes` - Keep in cache for 5 min
- `refetchOnWindowFocus: true` - Refetch on tab focus

**Override per query:**

```typescript
useQuery({
  queryKey: ['drivers'],
  queryFn: driversApi.list,
  staleTime: 30000, // 30 seconds
});
```

---

## Future Considerations

### When to Create a New Feature

**Create a new feature when:**

1. It maps to a backend domain/subdomain
2. It has 3+ components AND API endpoints
3. It has distinct types and business logic
4. Multiple pages will consume it

**Don't create a feature for:**

1. Single-use components (put in `app/` page)
2. Pure UI utilities (put in `shared/`)
3. Helpers with no domain logic

### Monorepo Considerations

**Current:** Apps in `apps/web/`

**Future:** Extract shared logic

```
packages/
├── ui/              # Shadcn components
├── api-client/      # API client
└── types/           # Shared types
```

---

## Quick Reference

**Adding a new feature:**

```bash
# Create structure
mkdir -p src/features/domain/feature-name/{api.ts,types.ts,hooks,components,__tests__}

# Create barrel export
touch src/features/domain/feature-name/index.ts
```

**Feature barrel template:**

```typescript
// API
export { featureApi, ...legacyExports } from './api';

// Types
export type { Type1, Type2 } from './types';

// Hooks
export { useFeature, useFeatureById } from './hooks/use-feature';

// Components (if any)
export { FeatureList } from './components/feature-list';

// Store (if needed)
export { useFeatureStore } from './store';
```

---

**Last Reviewed:** February 5, 2026
**Status:** ✅ Production Ready
**Build:** Passing
**Migration:** Complete
