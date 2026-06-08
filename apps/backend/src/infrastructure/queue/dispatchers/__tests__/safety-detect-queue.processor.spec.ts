import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SafetyDetectQueueProcessor } from '../safety-detect-queue.processor';
import { SAFETY_DETECT_JOB_NAMES } from '../../queue.constants';
import { DeadLetterService } from '../../dead-letter.service';

/**
 * Regression guard for the 2026-05-29 Shield incident: scheduled audits were
 * grabbed by the load-monitoring worker (competing consumers on the shared
 * safety-detect queue) and left QUEUED forever ("audit in progress" on the
 * dispatcher/shield page). With a single dispatcher, each job name MUST route to
 * the handler that owns it.
 */
describe('SafetyDetectQueueProcessor', () => {
  const mockDeadLetter = {
    recordPermanentFailure: jest.fn().mockResolvedValue(undefined),
  } as unknown as DeadLetterService;

  const audit = { jobNames: [SAFETY_DETECT_JOB_NAMES.AUDIT], run: jest.fn().mockResolvedValue('audited') };
  const loadMon = {
    jobNames: [SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING],
    run: jest.fn().mockResolvedValue('monitored'),
  };

  const dispatcher = new SafetyDetectQueueProcessor([audit, loadMon], mockDeadLetter);
  jest.spyOn((dispatcher as unknown as { logger: Logger }).logger, 'warn').mockImplementation();

  afterEach(() => jest.clearAllMocks());

  it('routes an AUDIT job to the shield-audit handler (never load-monitoring)', async () => {
    const result = await dispatcher.process({ name: SAFETY_DETECT_JOB_NAMES.AUDIT } as Job);
    expect(audit.run).toHaveBeenCalledTimes(1);
    expect(loadMon.run).not.toHaveBeenCalled();
    expect(result).toBe('audited');
  });

  it('routes a LOAD_MONITORING job to the load-monitoring handler (never shield-audit)', async () => {
    const result = await dispatcher.process({ name: SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING } as Job);
    expect(loadMon.run).toHaveBeenCalledTimes(1);
    expect(audit.run).not.toHaveBeenCalled();
    expect(result).toBe('monitored');
  });
});
