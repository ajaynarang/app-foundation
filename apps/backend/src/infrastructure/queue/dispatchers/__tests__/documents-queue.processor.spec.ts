import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DocumentsQueueProcessor } from '../documents-queue.processor';
import { DOCUMENTS_JOB_NAMES } from '../../queue.constants';
import { DeadLetterService } from '../../dead-letter.service';

/**
 * The regression guard for the 2026-05-29 staging incident: rate-con jobs were
 * silently grabbed by the email-intake worker (competing consumers on the
 * shared `documents` queue) and completed with `returnValue: null`. With a
 * single dispatcher, each job name MUST route to the handler that owns it.
 */
describe('DocumentsQueueProcessor', () => {
  const mockDeadLetter = {
    recordPermanentFailure: jest.fn().mockResolvedValue(undefined),
  } as unknown as DeadLetterService;

  const ratecon = { jobNames: [DOCUMENTS_JOB_NAMES.RATECON], run: jest.fn().mockResolvedValue({ loadNumber: 'L1' }) };
  const email = {
    jobNames: [DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT],
    run: jest.fn().mockResolvedValue({ attachmentId: 9 }),
  };

  const dispatcher = new DocumentsQueueProcessor([ratecon, email], mockDeadLetter);
  // Silence the no-handler warning in the orphan test.
  jest.spyOn((dispatcher as unknown as { logger: Logger }).logger, 'warn').mockImplementation();

  afterEach(() => jest.clearAllMocks());

  it('routes a RATECON job to the ratecon handler (never the email handler)', async () => {
    const result = await dispatcher.process({ name: DOCUMENTS_JOB_NAMES.RATECON } as Job);

    expect(ratecon.run).toHaveBeenCalledTimes(1);
    expect(email.run).not.toHaveBeenCalled();
    expect(result).toEqual({ loadNumber: 'L1' });
  });

  it('routes a PARSE_ATTACHMENT job to the email handler (never the ratecon handler)', async () => {
    const result = await dispatcher.process({ name: DOCUMENTS_JOB_NAMES.PARSE_ATTACHMENT } as Job);

    expect(email.run).toHaveBeenCalledTimes(1);
    expect(ratecon.run).not.toHaveBeenCalled();
    expect(result).toEqual({ attachmentId: 9 });
  });

  it('no-ops on an unknown job name without touching either handler', async () => {
    const result = await dispatcher.process({ name: 'unknown-name' } as Job);

    expect(result).toBeUndefined();
    expect(ratecon.run).not.toHaveBeenCalled();
    expect(email.run).not.toHaveBeenCalled();
  });
});
