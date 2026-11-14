import { OnEvent } from '@nestjs/event-emitter';
import { RLS_SOURCE, runInEventScope } from './rls-context';

type EventName = Parameters<typeof OnEvent>[0];
type OnEventOptions = Parameters<typeof OnEvent>[1];

/**
 * `@OnEvent` for a handler that touches tenant data. The handler runs as the tenant its first argument names
 * (`payload.tenantId`, a tenant DB id or its decimal string), in a fresh scope; it never relies on EventEmitter2
 * `{ async: true }` carrying the emitter's context. See `runInEventScope` for a payload that names no tenant.
 *
 * A handler that is cross-tenant by design uses `@OnEvent` plus `systemScope`; a handler that never touches the
 * database (SSE fan-out, cache invalidation) stays on plain `@OnEvent`.
 */
export function OnTenantEvent(event: EventName, options?: OnEventOptions): MethodDecorator {
  return (target, key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const source = `${RLS_SOURCE.EVENT}:${String(event)}`;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      const payload = args[0] as { tenantId?: unknown } | undefined;
      return runInEventScope(payload?.tenantId, source, () => Promise.resolve(original.apply(this, args)));
    };
    Object.defineProperty(wrapped, 'name', { value: original.name });
    descriptor.value = wrapped;
    return OnEvent(event, options)(target, key, descriptor);
  };
}
