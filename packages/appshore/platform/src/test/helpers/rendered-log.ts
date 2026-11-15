import { serializeErrorForLog } from '@appshore/kernel/infrastructure/logging/log-serializers';

/**
 * What captured `Logger` calls would print. The `err` field goes through the app's `err` serializer, the way pino-http
 * runs it; every other field, the message included, is printed as given. A spec that asserts an address is absent from
 * this text fails when a provider's error text is flattened into the message, which the serializer never sees.
 */
export function renderLogCalls(calls: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return calls
    .map((args) =>
      args
        .map((arg) => {
          if (!arg || typeof arg !== 'object') return String(arg);
          const fields = { ...(arg as Record<string, unknown>) };
          if (fields.err && typeof fields.err === 'object') {
            fields.err = serializeErrorForLog(fields.err as Record<string, unknown>);
          }
          return JSON.stringify(fields);
        })
        .join(' '),
    )
    .join('\n');
}
