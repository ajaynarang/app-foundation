import type { AgentKey } from '@app/shared-types';

import type { ResponsibilityDefinition } from './definition.types';

/**
 * COMING_SOON responsibility stubs — metadata only, no workflow/tools
 * wired. The UI renders them as greyed-out cards with a "Notify me" CTA.
 * Seed creates the desk_responsibilities row so future phases can flip
 * `lifecycle='AVAILABLE'` without a schema migration.
 *
 * Adding responsibility #2+: author its definition next to ar-followup/
 * (e.g., responsibilities/eta-monitoring/definition.ts), flip the entry
 * here to point to it, promote the row to AVAILABLE in seed.
 */
const STUB_DEFAULTS = {
  trustLevel: 'SUPERVISED' as const,
  conditions: {},
};

function stub(key: string, agentKey: AgentKey, title: string, description: string): ResponsibilityDefinition {
  return {
    key: key as ResponsibilityDefinition['key'],
    agentKey,
    title,
    description,
    lifecycle: 'COMING_SOON',
    conditionsSchema: null,
    conditionsUI: null,
    defaults: STUB_DEFAULTS,
    triggers: [],
    tools: [],
  };
}

export const COMING_SOON_RESPONSIBILITIES: readonly ResponsibilityDefinition[] = [
  stub(
    'eta_monitoring',
    'sally-route',
    'Warn brokers when deliveries will be late',
    'Watches in-flight loads. When one will be late, Sally drafts a proactive heads-up to the broker.',
  ),
  stub(
    'driver_assignment',
    'sally-dispatch',
    'Pick the best driver for a new load',
    'When a load is created, Sally scores your active drivers and proposes the best pick with reasons.',
  ),
  stub(
    'preventive_maintenance',
    'sally-maintenance',
    'Schedule preventive maintenance before it lapses',
    'Watches vehicles approaching their PM date and proposes a service date that avoids busy weeks.',
  ),
  stub(
    'vehicle_inspection',
    'sally-compliance',
    'Remind fleet admin before annual inspections lapse',
    'Weekly scan for vehicles with upcoming annual inspections; drafts a reminder to admin + driver.',
  ),
  stub(
    'deadhead_optimization',
    'sally-dispatch',
    'Flag drivers returning empty',
    'Daily sweep for drivers delivered without a next load so dispatch can re-cover quickly.',
  ),
  stub(
    'hos_monitoring',
    'sally-compliance',
    'Flag drivers approaching their HOS limit',
    'Event-triggered when a driver nears the HOS cliff; Sally flags dispatch and optionally SMSes the driver.',
  ),
] as const;
