import 'reflect-metadata';
import { AgentScope, AgentScopeSchema } from '@app/shared-types';

export const REQUIRES_SCOPE_METADATA_KEY = 'sally:requires-scope';

/**
 * Declares the single AgentScope required to call a tool method.
 * Validated at decoration time against AgentScopeSchema; invalid scopes
 * throw so the build fails fast.
 */
export function RequiresScope(scope: AgentScope): MethodDecorator {
  const parsed = AgentScopeSchema.safeParse(scope);
  if (!parsed.success) {
    throw new Error(`Invalid scope "${scope}" passed to @RequiresScope`);
  }
  return (target, propertyKey) => {
    Reflect.defineMetadata(REQUIRES_SCOPE_METADATA_KEY, scope, target, propertyKey);
  };
}

export function getRequiredScope(target: object, propertyKey: string | symbol): AgentScope | undefined {
  return Reflect.getMetadata(REQUIRES_SCOPE_METADATA_KEY, target, propertyKey) as AgentScope | undefined;
}
