import {
  FOUNDATION_EVENT_REGISTRY,
  type EventCategory,
  type EventDefinition,
} from '@appshore/kernel/infrastructure/events/foundation-events';

export type { EventCategory, EventDefinition };

/**
 * YOUR domain events — the app extension point.
 *
 * Each entry derives a `DOMAIN_EVENTS.<constantName>` literal whose value is
 * `key`. Event keys are namespaced `app.<aggregate>.<verb>`; the in-process
 * subscribers listen on the `app.**` wildcard.
 */
export const APP_EVENT_REGISTRY = [] as const satisfies readonly EventDefinition[];

/** Full catalog: foundation events + your app events. */
export const EVENT_REGISTRY = [
  ...FOUNDATION_EVENT_REGISTRY,
  ...APP_EVENT_REGISTRY,
] as const satisfies readonly EventDefinition[];

// ─── Lookup Helpers ──────────────────────────────────────────────────

const registryMap = new Map<string, EventDefinition>(EVENT_REGISTRY.map((e) => [e.key, e]));

export function getEventDefinition(key: string): EventDefinition | undefined {
  return registryMap.get(key);
}

export function getExternalEvents(): EventDefinition[] {
  return EVENT_REGISTRY.filter((e) => e.visibility === 'external');
}

export interface EventCatalogCategory {
  label: EventCategory;
  events: {
    name: string;
    label: string;
    description: string;
  }[];
}

export function getExternalEventsByCategory(): EventCatalogCategory[] {
  const categoryMap = new Map<EventCategory, EventCatalogCategory>();

  for (const def of EVENT_REGISTRY) {
    if (def.visibility === 'internal') continue;

    let cat = categoryMap.get(def.category);
    if (!cat) {
      cat = { label: def.category, events: [] };
      categoryMap.set(def.category, cat);
    }
    cat.events.push({
      name: def.key,
      label: def.label,
      description: def.description,
    });
  }

  return Array.from(categoryMap.values());
}
