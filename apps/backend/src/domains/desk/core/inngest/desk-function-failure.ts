import { Logger } from '@nestjs/common';
import { ERROR_SOURCE, reportError } from '@appshore/kernel/infrastructure/error-tracking/sentry';
import { toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';

const logger = new Logger('DeskFunctionFailure');

/** The `event` value of the failure line (docs/standards/observability.md, rule 6). */
export const DESK_FUNCTION_FAILED_EVENT = 'workflow.failed';

/** The slice of Inngest's `inngest/function.failed` payload this handler reads. */
export interface DeskFunctionFailureArgs {
  error: Error;
  event: {
    data: {
      function_id: string;
      run_id: string;
      event?: { data?: { tenantId?: unknown; episodeId?: unknown } };
    };
  };
}

function idOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

/**
 * `onFailure` for every Desk Inngest function: runs once a run has used up its retries. It makes the failure
 * visible to on-call: one structured log line and one error-tracker issue tagged with the tenant and function. Ids
 * only, never the triggering event's payload.
 */
export function reportDeskFunctionFailure({ error, event }: DeskFunctionFailureArgs): void {
  const functionId = event.data.function_id;
  const runId = event.data.run_id;
  const tenantId = idOrUndefined(event.data.event?.data?.tenantId);
  const episodeId = idOrUndefined(event.data.event?.data?.episodeId);

  logger.error({
    msg: `Desk function ${functionId} failed after retries (run ${runId})`,
    event: DESK_FUNCTION_FAILED_EVENT,
    functionId,
    runId,
    tenantId,
    episodeId,
    err: toLoggableError(error),
  });
  reportError(error, { tenantId, jobName: functionId, jobId: runId, source: ERROR_SOURCE.WORKFLOW });
}
