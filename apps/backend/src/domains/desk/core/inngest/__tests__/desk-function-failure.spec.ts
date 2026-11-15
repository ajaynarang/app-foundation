import { Logger } from '@nestjs/common';
import { Inngest, internalEvents } from 'inngest';
import * as errorTracking from '@appshore/kernel/infrastructure/error-tracking/sentry';
import { DESK_FUNCTION_FAILED_EVENT, reportDeskFunctionFailure } from '../desk-function-failure';
import { buildDeskInngestFunctions } from '../desk-inngest-functions';

function failureArgs(originalData: Record<string, unknown>) {
  return {
    error: new Error('step exploded after retries'),
    event: {
      data: {
        function_id: 'app-desk-welcome',
        run_id: 'run-123',
        event: { data: originalData },
      },
    },
  };
}

describe('reportDeskFunctionFailure', () => {
  let errorSpy: jest.SpyInstance;
  let report: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    report = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs one structured line and reports one issue tagged with tenant, function and source workflow', () => {
    const args = failureArgs({ tenantId: 7, episodeId: 'ep-1', invoiceNumber: 'INV-9' });

    reportDeskFunctionFailure(args);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: DESK_FUNCTION_FAILED_EVENT,
        functionId: 'app-desk-welcome',
        runId: 'run-123',
        tenantId: '7',
        episodeId: 'ep-1',
        err: expect.objectContaining({ type: 'Error', message: args.error.message }),
      }),
    );
    expect(report).toHaveBeenCalledWith(args.error, {
      tenantId: '7',
      jobName: 'app-desk-welcome',
      jobId: 'run-123',
      source: 'workflow',
    });
  });

  it('never copies the triggering event payload into the log line', () => {
    reportDeskFunctionFailure(failureArgs({ tenantId: 7, contactPhone: '+15555550100' }));

    expect(JSON.stringify(errorSpy.mock.calls[0][0])).not.toContain('+15555550100');
  });

  it('tolerates a failure event with no original event data', () => {
    reportDeskFunctionFailure({
      error: new Error('x'),
      event: { data: { function_id: 'desk-scheduler-heartbeat', run_id: 'r' } },
    });

    expect(report).toHaveBeenCalledWith(expect.any(Error), {
      tenantId: undefined,
      jobName: 'desk-scheduler-heartbeat',
      jobId: 'r',
      source: 'workflow',
    });
  });
});

describe('Desk Inngest functions', () => {
  type FunctionConfig = { id: string; triggers: Array<{ event?: string; expression?: string }> };
  type ConfigurableFunction = {
    id: (appPrefix?: string) => string;
    getConfig: (opts: { baseUrl: URL; appPrefix: string; isConnect: boolean }) => FunctionConfig[];
  };

  it('every served function, the scheduler included, registers a failure function with the Inngest server', () => {
    const client = new Inngest({ id: 'app-test' });

    const functions = buildDeskInngestFunctions(client) as unknown as ConfigurableFunction[];

    expect(functions.length).toBeGreaterThan(0);
    for (const fn of functions) {
      // getConfig is the sync payload sent to the Inngest server, so it is the wire contract: an onFailure handler
      // shows up as a second "<id>-failure" function triggered by inngest/function.failed for this function.
      const configs = fn.getConfig({
        baseUrl: new URL('http://localhost/api/v1/inngest'),
        appPrefix: 'app-test',
        isConnect: false,
      });
      const fnId = fn.id('app-test');
      expect(configs).toContainEqual(
        expect.objectContaining({
          id: `${fnId}-failure`,
          triggers: [
            expect.objectContaining({
              event: internalEvents.FunctionFailed,
              expression: `event.data.function_id == '${fnId}'`,
            }),
          ],
        }),
      );
    }
  });
});
