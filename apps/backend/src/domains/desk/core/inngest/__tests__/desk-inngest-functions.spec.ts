import { Inngest } from 'inngest';

import { buildDeskInngestFunctions } from '../desk-inngest-functions';
import { InngestController } from '../inngest.controller';
import { DESK_SCHEDULER_ENABLED_ENV } from '../../scheduler/scheduler-availability';

const serve = jest.fn((_opts: { functions: Array<{ id: (prefix?: string) => string }> }) => jest.fn());
jest.mock('inngest/express', () => ({ serve: (opts: never) => serve(opts) }));

const HEARTBEAT_ID = 'desk-scheduler-heartbeat';
const ids = (functions: Array<{ id: (prefix?: string) => string }>) => functions.map((fn) => fn.id());

/**
 * `DESK_SCHEDULER_ENABLED=false` keeps the scheduler heartbeat from being registered with Inngest at all, so an
 * environment that does not use automatic Desk runs pays for no cron tick. Unset keeps today's behaviour.
 */
describe('buildDeskInngestFunctions', () => {
  const client = new Inngest({ id: 'app-test' });

  it('serves the scheduler heartbeat by default', () => {
    expect(ids(buildDeskInngestFunctions(client) as never)).toContain(HEARTBEAT_ID);
  });

  it('leaves the heartbeat out when the scheduler is off', () => {
    expect(ids(buildDeskInngestFunctions(client, { schedulerEnabled: false }) as never)).not.toContain(HEARTBEAT_ID);
  });
});

describe('InngestController', () => {
  const prev = process.env[DESK_SCHEDULER_ENABLED_ENV];
  const client = new Inngest({ id: 'app-test' });
  const boot = () => {
    serve.mockClear();
    new InngestController({ client } as never).onApplicationBootstrap();
    return ids(serve.mock.calls[0][0].functions);
  };

  afterEach(() => {
    if (prev === undefined) delete process.env[DESK_SCHEDULER_ENABLED_ENV];
    else process.env[DESK_SCHEDULER_ENABLED_ENV] = prev;
  });

  it('registers the heartbeat when DESK_SCHEDULER_ENABLED is unset', () => {
    delete process.env[DESK_SCHEDULER_ENABLED_ENV];
    expect(boot()).toContain(HEARTBEAT_ID);
  });

  it('does not register the heartbeat when DESK_SCHEDULER_ENABLED=false', () => {
    process.env[DESK_SCHEDULER_ENABLED_ENV] = 'false';
    expect(boot()).not.toContain(HEARTBEAT_ID);
  });
});
