import type { SseEventType, SsePayloadFor } from '@sally/shared-types';

type Handler<T extends SseEventType> = (payload: SsePayloadFor<T>) => void;

/**
 * Typed in-memory pub/sub for SSE events. Owned by SseProvider.
 * One bus per browser session — there is exactly one EventSource feeding it.
 *
 * Errors thrown inside a handler are caught so one bad subscriber cannot
 * take down the bus.
 */
export class SseBus {
  private readonly handlers = new Map<SseEventType, Set<Handler<SseEventType>>>();

  subscribe<T extends SseEventType>(type: T, fn: Handler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler<SseEventType>>();
    set.add(fn as Handler<SseEventType>);
    this.handlers.set(type, set);
    return () => {
      set.delete(fn as Handler<SseEventType>);
      if (set.size === 0) this.handlers.delete(type);
    };
  }

  emit<T extends SseEventType>(type: T, payload: SsePayloadFor<T>): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Handler<T>)(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[SseBus] handler for ${type} threw:`, err);
      }
    }
  }
}
