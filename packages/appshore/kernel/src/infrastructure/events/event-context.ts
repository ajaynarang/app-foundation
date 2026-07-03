import { AsyncLocalStorage } from 'async_hooks';
import { EventActor } from './domain-event';

const storage = new AsyncLocalStorage<EventActor>();

export const EventContext = {
  run: <T>(actor: EventActor, fn: () => T): T => storage.run(actor, fn),
  getActor: (): EventActor | undefined => storage.getStore(),
};
