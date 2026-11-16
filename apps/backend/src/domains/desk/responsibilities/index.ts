import type { ResponsibilityDefinition } from './definition.types';
import { COMING_SOON_RESPONSIBILITIES } from './coming-soon';
import { SUPPORT_FOLLOWUP_DEFINITION } from './support-followup/definition';

/**
 * Responsibility registry — the Desk engine's main extension point.
 *
 * Code-authored; not user-editable. Seeded into desk_responsibilities rows per
 * tenant (see seeds/). Order matters for the UI — index order = card order.
 *
 * The starter ships two:
 *   - `welcome`: a no-op that shows the smallest valid definition. Manual trigger only, no tools, no run method.
 *   - `support_followup`: the reference job. It is real, and it is the one to copy
 *     (`responsibilities/support-followup/definition.ts` lists every file and every registration).
 *
 * To add a real responsibility:
 *   1. Author its definition under `responsibilities/<key>/definition.ts`.
 *   2. Register it in this array.
 *   3. Add a `run<X>ForTenant` method + `runByKey` case in `core/trigger`.
 *   4. Register its step prompts (perceive/decide/draft) via a prompt registrar.
 */

/** Generic, no-op example responsibility. Replace or delete as you build. */
const WELCOME_DEFINITION: ResponsibilityDefinition = {
  key: 'welcome',
  agentKey: 'assistant',
  title: 'Welcome',
  description:
    'A no-op example responsibility. It demonstrates the registry shape — manual trigger only, no tools, no fan-out. Replace it with your own.',
  lifecycle: 'AVAILABLE',
  conditionsSchema: null,
  conditionsUI: null,
  defaults: { trustLevel: 'SUPERVISED', conditions: {} },
  triggers: [{ kind: 'manual' }],
  tools: [],
};

export const RESPONSIBILITY_REGISTRY: readonly ResponsibilityDefinition[] = [
  WELCOME_DEFINITION,
  SUPPORT_FOLLOWUP_DEFINITION,
  ...COMING_SOON_RESPONSIBILITIES,
] as const;

export function findResponsibilityDefinition(key: string): ResponsibilityDefinition | undefined {
  return RESPONSIBILITY_REGISTRY.find((r) => r.key === key);
}

export function responsibilityKeys(): string[] {
  return RESPONSIBILITY_REGISTRY.map((r) => r.key);
}

export * from './definition.types';
export { COMING_SOON_RESPONSIBILITIES, stub } from './coming-soon';
