import 'reflect-metadata';
import type { UserRole } from '@appshore/db';
import { FEATURE_KEYS, type FeatureKey } from '@app/shared-types';

export const TOOL_ROLES_METADATA_KEY = 'app:tool-roles';
export const TOOL_PLAN_FEATURE_METADATA_KEY = 'app:tool-plan-feature';

/**
 * Declares which workspace roles may run a tool, matching the `@Roles(...)` of the REST endpoint that does the same
 * thing. The pipeline checks it against the acting person's CURRENT role in the principal's workspace
 * (`WorkspaceMember`), never the conversation's persona or anything the model sends.
 */
export function RestrictToRoles(roles: readonly UserRole[]): MethodDecorator {
  if (roles.length === 0) throw new Error('@RestrictToRoles needs at least one role');
  const frozen = Object.freeze([...roles]);
  return (target, propertyKey) => {
    Reflect.defineMetadata(TOOL_ROLES_METADATA_KEY, frozen, target, propertyKey);
  };
}

export function getToolRoleRestriction(target: object, propertyKey: string | symbol): readonly UserRole[] | undefined {
  return Reflect.getMetadata(TOOL_ROLES_METADATA_KEY, target, propertyKey) as readonly UserRole[] | undefined;
}

const KNOWN_FEATURE_KEYS = new Set<string>(Object.values(FEATURE_KEYS));

/**
 * Declares the plan feature a tool belongs to: the same key its REST twin passes to `@RequireFeature`. The pipeline
 * judges the workspace by the one plan rule `PlanGuard` also runs (`TenantEntitlementsService`) before the tool runs, so an agent cannot reach a feature the web app
 * or the API would refuse.
 */
export function RequiresPlanFeature(feature: FeatureKey): MethodDecorator {
  if (!KNOWN_FEATURE_KEYS.has(feature)) {
    throw new Error(`Unknown feature "${feature}" passed to @RequiresPlanFeature`);
  }
  return (target, propertyKey) => {
    Reflect.defineMetadata(TOOL_PLAN_FEATURE_METADATA_KEY, feature, target, propertyKey);
  };
}

export function getToolPlanFeature(target: object, propertyKey: string | symbol): FeatureKey | undefined {
  return Reflect.getMetadata(TOOL_PLAN_FEATURE_METADATA_KEY, target, propertyKey) as FeatureKey | undefined;
}
