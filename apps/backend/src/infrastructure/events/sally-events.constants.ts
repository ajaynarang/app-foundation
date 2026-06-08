import { EVENT_REGISTRY } from './event-registry';

// Preserves literal string types: SALLY_EVENTS.LOAD_CREATED is typed as 'sally.load.created'
export const SALLY_EVENTS = Object.fromEntries(EVENT_REGISTRY.map((e) => [e.constantName, e.key] as const)) as {
  [K in (typeof EVENT_REGISTRY)[number] as K['constantName']]: K['key'];
};

export type SallyEventName = (typeof SALLY_EVENTS)[keyof typeof SALLY_EVENTS];
