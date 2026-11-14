---
owner: foundation
status: interim
pending: F4
sources:
  - packages/appshore/platform/src/auth/guards/plan.guard.ts#PlanGuard
  - packages/appshore/platform/src/auth/decorators/require-feature.decorator.ts#RequireFeature
  - packages/appshore/platform/src/auth/decorators/no-feature-gate.decorator.ts#NoFeatureGate
  - packages/appshore/platform/src/domains/entitlements/tenant-entitlements.service.ts#TenantEntitlementsService
  - packages/shared-types/src/platform/feature-keys.ts
  - apps/backend/src/domains/ai/agent-contract/tool-policy.decorator.ts#RequiresPlanFeature
guards:
  - plan-gated-routes.spec.ts
  - feature-key-coverage.spec.ts
  - plan.guard.spec.ts
  - no-feature-gate.decorator.spec.ts
---

# Plans and entitlements: gating a route, a job and a tool

Moved from the old backend skill (its plan-gate text); its finish pull request adds the seat check, `PLAN_ENFORCEMENT`,
the upgrade prompt on the web and the recipe for a new feature key, written from the code.

## Rules

- A plan-gated route carries `@RequireFeature(FEATURE_KEYS.X)` on the handler or the class. The global chain checks
  roles first (cheap), then `PlanGuard`, its last guard, asks the plan; the order of the decorators does not change
  that. The keys are `FEATURE_KEYS` in
  `packages/shared-types/src/platform/feature-keys.ts`. [guard: plan-gated-routes.spec.ts, feature-key-coverage.spec.ts]
- The one plan rule is `TenantEntitlementsService`: `PlanGuard` runs `assertFeature` for every gated route, and a job,
  a cron, a handler whose feature depends on its input, and the AI tool pipeline call `assertFeature` or `hasFeature`
  directly. Never copy the rule. [guard: plan.guard.spec.ts]
- Gate at the HTTP boundary, not inside a service another domain calls: a job, a tool or an internal trigger reaches
  the service on its own terms and checks the plan itself where it must. [review-only: needs reading]
- A route on a gated controller that must stay open opts out on the handler with `@NoFeatureGate()`; it is read from the
  handler only, so a controller cannot opt its whole surface out. [guard: no-feature-gate.decorator.spec.ts]
- A tool whose REST twin has `@RequireFeature(key)` declares `@RequiresPlanFeature(key)`; see
  [`ai-tools.md`](ai-tools.md). [guard: mcp-tool.write-parity.spec.ts]
- A plan gate is not a kill switch: a platform switch is a feature flag read with `FeatureFlagsService.isEnabled`
  ([`config-and-secrets.md`](config-and-secrets.md)). [review-only: a modelling choice]

## Flag in review

- A plan check copied into a service instead of a call to the entitlements service.
- A REST route gated and its tool twin not.
- `@NoFeatureGate()` on a class.
