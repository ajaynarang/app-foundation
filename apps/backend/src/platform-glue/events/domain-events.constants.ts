import { EVENT_REGISTRY } from './event-registry';

// Preserves literal string types: DOMAIN_EVENTS.LOAD_CREATED is typed as 'app.load.created'
export const DOMAIN_EVENTS = Object.fromEntries(EVENT_REGISTRY.map((e) => [e.constantName, e.key] as const)) as {
  [K in (typeof EVENT_REGISTRY)[number] as K['constantName']]: K['key'];
};

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
