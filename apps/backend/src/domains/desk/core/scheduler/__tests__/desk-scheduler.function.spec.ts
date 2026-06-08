import type { Inngest } from 'inngest';

import { createDeskSchedulerFunction, HEARTBEAT_CRON } from '../desk-scheduler.function';

/**
 * The heartbeat logic is exercised in desk-scheduler.service.spec.ts. Here we
 * only pin the Inngest wiring: the factory must register a CRON-triggered
 * function (every minute) with the stable id `desk-scheduler-heartbeat`. The
 * trigger shape matters — it's what makes this an Inngest schedule rather than
 * an event consumer, and it mirrors the event functions' `triggers: [...]`
 * config (cron swapped for event).
 */
describe('createDeskSchedulerFunction', () => {
  it('registers a cron function (every minute) with the heartbeat id', () => {
    const created = { __fn: true };
    const createFunction = jest.fn().mockReturnValue(created);
    const client = { createFunction } as unknown as Inngest;

    const result = createDeskSchedulerFunction(client);

    expect(result).toBe(created);
    expect(createFunction).toHaveBeenCalledTimes(1);

    const [config] = createFunction.mock.calls[0];
    expect(config).toMatchObject({
      id: 'desk-scheduler-heartbeat',
      triggers: [{ cron: HEARTBEAT_CRON }],
    });
  });

  it('passes a handler function as the second argument', () => {
    const createFunction = jest.fn().mockReturnValue({});
    const client = { createFunction } as unknown as Inngest;

    createDeskSchedulerFunction(client);

    const [, handler] = createFunction.mock.calls[0];
    expect(typeof handler).toBe('function');
  });
});
