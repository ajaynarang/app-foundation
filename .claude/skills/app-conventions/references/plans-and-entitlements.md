---
owner: foundation
sources:
  - packages/appshore/platform/src/auth/guards/plan.guard.ts#PlanGuard
  - packages/appshore/platform/src/auth/guards/plan-access.rules.ts#planEnforcementMode
  - packages/appshore/platform/src/auth/guards/plan-access.rules.ts#PLAN_WOULD_DENY_EVENT
  - packages/appshore/platform/src/auth/guards/plan-access.rules.ts#killSwitchKey
  - packages/appshore/platform/src/auth/guards/plan-access.errors.ts#PLAN_DENIAL_CODES
  - packages/appshore/platform/src/auth/decorators/require-feature.decorator.ts#RequireFeature
  - packages/appshore/platform/src/auth/decorators/no-feature-gate.decorator.ts#NoFeatureGate
  - packages/appshore/platform/src/domains/entitlements/tenant-entitlements.service.ts#TenantEntitlementsService
  - packages/appshore/platform/src/domains/entitlements/tenant-entitlements.service.ts#assertUserSeatAvailable
  - packages/appshore/platform/src/domains/users/users.service.ts
  - packages/appshore/platform/src/domains/user-invitations/user-invitations.service.ts
  - packages/shared-types/src/platform/feature-keys.ts#FEATURE_KEYS
  - packages/appshore/db/prisma/seeds/04-plan-entitlements.seed.ts
  - apps/backend/src/config/configuration.ts
  - apps/backend/src/domains/ai/agent-contract/tool-policy.decorator.ts#RequiresPlanFeature
  - apps/backend/src/architecture/feature-key-coverage.spec.ts
  - packages/appshore/web-core/src/shared/lib/plan-upgrade.ts#showPlanUpgradePrompt
  - apps/web/src/app/providers.tsx
  - apps/web/src/features/platform/plans/config/upgrade-registry.ts#upgradeRegistry
  - apps/web/src/features/platform/plans/components/upgrade-prompt.tsx#UpgradePrompt
guards:
  - plan-gated-routes.spec.ts
  - feature-key-coverage.spec.ts
  - plan.guard.spec.ts
  - no-feature-gate.decorator.spec.ts
  - tenant-entitlements.service.spec.ts
  - users.service.spec.ts
  - user-invitations.service.spec.ts
  - mcp-tool.write-parity.spec.ts
  - plan-upgrade.test.ts
examples:
  - REPORTS
  - reports
  - ReportsController
  - ReportExportJobHandler
---

# Plans and entitlements: gating a route, a job, a tool and a seat

A plan says which features a workspace has. There is one rule for it, `TenantEntitlementsService`, and every surface
asks it: the global `PlanGuard` for a route, the service directly for a job, a cron, a handler or the AI tool pipeline.
Feature keys are `FEATURE_KEYS` in `packages/shared-types/src/platform/feature-keys.ts`; which plan has which key is the
`PlanEntitlement` rows seeded by `packages/appshore/db/prisma/seeds/04-plan-entitlements.seed.ts` and edited on the plan
admin page.

Every check runs in this order: the kill switch (a feature flag), the super-admin bypass, the single-tenant bypass
(the implicit tenant is top tier), the plan's status (trial expired, suspended), then the plan's entitlement.

| Denial                  | `code`                               | The web shows                              |
| ----------------------- | ------------------------------------ | ------------------------------------------ |
| Kill switch off         | `FEATURE_DISABLED`                   | the `detail` toast                         |
| No workspace in session | `NO_TENANT`                          | the `detail` toast                         |
| Trial over / suspended  | `TRIAL_EXPIRED`, `ACCOUNT_SUSPENDED` | the `detail` toast                         |
| Plan lacks the feature  | `PLAN_UPGRADE_REQUIRED`              | the upgrade prompt, linking the plans page |
| Seats full              | `USER_LIMIT_REACHED`                 | the upgrade prompt about seats             |

## Rules

- A plan-gated route carries `@RequireFeature(FEATURE_KEYS.X)` on the handler or the class. `PlanGuard`, the last
  guard in the global chain, runs after the role check whatever the decorator order.
  [guard: plan-gated-routes.spec.ts, plan.guard.spec.ts]
- Every key in `FEATURE_KEYS` is enforced somewhere (`@RequireFeature`, `@RequiresPlanFeature`, or an
  `assertFeature` / `hasFeature` call), or sits on the spec's display-only list with a reason; and every plan key has
  an entitlement row on each of the four plans. [guard: feature-key-coverage.spec.ts]
- The rule is never copied. A job, a cron, a handler whose feature depends on its input, and the tool pipeline call
  `assertFeature` (throws the 403) or `hasFeature` (a boolean, never throws) with the tenant's numeric id.
  [guard: tenant-entitlements.service.spec.ts]
- Gate at the boundary a caller crosses (a route, a tool, a job), not inside a service another domain calls.
  [review-only: needs reading]
- A route on a gated controller that must stay open opts out on the handler with `@NoFeatureGate()`; it is read from
  the handler only, so a controller cannot opt its whole surface out. [guard: no-feature-gate.decorator.spec.ts]
- A tool whose REST twin has `@RequireFeature(key)` declares `@RequiresPlanFeature(key)` ([`ai-tools.md`](ai-tools.md)).
  [guard: mcp-tool.write-parity.spec.ts]
- A seat is an active member plus each pending, unexpired invitation. `assertUserSeatAvailable` is called where a seat
  is added (user create, user reactivate, invitation create), never on a role change; a tenant over its limit loses
  nothing, adding is refused. [guard: tenant-entitlements.service.spec.ts, users.service.spec.ts,
  user-invitations.service.spec.ts]
- `PLAN_ENFORCEMENT=log` turns every plan denial and the seat limit into one `plan.would_deny` warning and lets the
  call through; `enforce` (the default) refuses. A kill switch holds in both modes, and a check passed
  `{ strict: true }` enforces in both. [guard: tenant-entitlements.service.spec.ts]
- A denial is a 403 with `code` and `detail` only, built by the factories in `plan-access.errors.ts`.
  [guard: tenant-entitlements.service.spec.ts]
- On the web, `showPlanUpgradePrompt` turns `PLAN_UPGRADE_REQUIRED` and `USER_LIMIT_REACHED` into one toast linking
  the plans page, and returns false for every other error. The global mutation fallback in `providers.tsx` calls it;
  a mutation with its own `onError` calls it before its own toast. [guard: plan-upgrade.test.ts]
- A plan gate is not a kill switch: a platform-wide switch is a feature flag read with `FeatureFlagsService.isEnabled`
  ([`config-and-secrets.md`](config-and-secrets.md)). A feature's kill switch is its own key unless `killSwitchKey`
  maps it. [review-only: a modelling choice]

## Recipe: gate a feature

**A route** (the whole controller, one handler left open):

```ts
@Controller('reports')
@RequireFeature(FEATURE_KEYS.REPORTS)
export class ReportsController {
  @Get('summary') @NoFeatureGate() summary() {
    /* open on every plan */
  }
}
```

**A job or a handler** (no request, so no guard): ask the service with the tenant's numeric id and say where it ran.

```ts
if (!(await this.entitlements.hasFeature(tenantDbId, FEATURE_KEYS.REPORTS, { route: 'job:report-export' }))) return;
```

Use `assertFeature` instead when the caller should see the 403 (a handler on a request path). **A tool**: put
`@RequiresPlanFeature(FEATURE_KEYS.REPORTS)` on it; the tool pipeline asks the plan.

**A web surface**: a refused mutation already shows the upgrade prompt. To show a feature's pitch before the user
tries it, render `<UpgradePrompt feature={...} />` from `features/platform/plans`.

## Recipe: add a feature key

1. Add the key to `FEATURE_KEYS` in `packages/shared-types/src/platform/feature-keys.ts` (lowercase snake_case).
2. Add an entitlement row for it on every plan in `04-plan-entitlements.seed.ts`; re-seed with
   `pnpm --filter @appshore/db db:seed`.
3. Gate it as above, or add it to `DISPLAY_ONLY` in `feature-key-coverage.spec.ts` with the reason it is unchecked.
4. Add its upgrade pitch to `upgradeRegistry` in `apps/web/src/features/platform/plans/config/upgrade-registry.ts`.
5. On a product with live tenants, deploy with `PLAN_ENFORCEMENT=log`, read a week of `plan.would_deny` lines, then
   switch back to `enforce`.

## Flag in review

- A plan check copied into a service instead of a call to the entitlements service.
- A REST route gated and its tool twin not.
- `@NoFeatureGate()` on a class.
- A new seat path (an import, an SSO join) that adds a member without `assertUserSeatAvailable`.
- `PLAN_ENFORCEMENT=log` left on in production with no date to turn it off.
