import type { AgentKey } from '../core/types';

import type { ResponsibilityDefinition } from './definition.types';

/**
 * COMING_SOON responsibility stubs — metadata only, no workflow/tools wired.
 * The UI renders them as greyed-out cards with a "Notify me" CTA. The seed
 * creates the desk_responsibilities row so a future phase can flip
 * `lifecycle='AVAILABLE'` without a schema migration.
 *
 * The starter ships NO stubs. Add your own "coming soon" teasers here, or
 * author full AVAILABLE responsibilities under `responsibilities/<key>/` and
 * register them in `responsibilities/index.ts`.
 */
export function stub(key: string, agentKey: AgentKey, title: string, description: string): ResponsibilityDefinition {
  return {
    key: key as ResponsibilityDefinition['key'],
    agentKey,
    title,
    description,
    lifecycle: 'COMING_SOON',
    conditionsSchema: null,
    conditionsUI: null,
    defaults: { trustLevel: 'SUPERVISED', conditions: {} },
    triggers: [],
    tools: [],
  };
}

export const COMING_SOON_RESPONSIBILITIES: readonly ResponsibilityDefinition[] = [];
