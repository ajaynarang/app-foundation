import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { AlertNotificationsJobHandler } from '../alert-notifications.processor';
import { EscalationService } from '../alerts/services/escalation.service';
import { AutoResolutionService } from '../alerts/services/auto-resolution.service';
import { AlertDigestService } from '../alerts/services/alert-digest.service';
import { NOTIFICATIONS_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';

function makeEnvelope<P>(payload: P): JobEnvelope<P> {
  return {
    tenantId: 'system',
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'cron', version: 1 },
  };
}

function makeJob<P>(
  name: string,
  payload: P,
  opts?: { attemptsMade?: number; attempts?: number },
): Job<JobEnvelope<P>> {
  return {
    id: 'j1',
    name,
    data: makeEnvelope(payload),
    attemptsMade: opts?.attemptsMade ?? 0,
    opts: { attempts: opts?.attempts ?? 1 },
  } as unknown as Job<JobEnvelope<P>>;
}

describe('AlertNotificationsJobHandler', () => {
  let handler: AlertNotificationsJobHandler;

  const mockEscalation = {
    checkEscalations: jest.fn().mockResolvedValue({ escalated: 0 }),
  };
  const mockAutoResolution = {
    unsnoozeExpired: jest.fn().mockResolvedValue({ unsnoozed: 0 }),
  };
  const mockAlertDigest = {
    generateDailyDigest: jest.fn().mockResolvedValue(undefined),
    generateShiftSummary: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertNotificationsJobHandler,
        { provide: EscalationService, useValue: mockEscalation },
        { provide: AutoResolutionService, useValue: mockAutoResolution },
        { provide: AlertDigestService, useValue: mockAlertDigest },
      ],
    }).compile();

    handler = module.get<AlertNotificationsJobHandler>(AlertNotificationsJobHandler);
    jest.clearAllMocks();
  });

  describe('run — owned job names', () => {
    it('invokes checkEscalations for ALERT_ESCALATION', async () => {
      await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.ALERT_ESCALATION, {}));
      expect(mockEscalation.checkEscalations).toHaveBeenCalledTimes(1);
    });

    it('invokes unsnoozeExpired for ALERT_UNSNOOZE', async () => {
      await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.ALERT_UNSNOOZE, {}));
      expect(mockAutoResolution.unsnoozeExpired).toHaveBeenCalledTimes(1);
    });

    it('invokes generateDailyDigest for ALERT_DIGEST', async () => {
      await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.ALERT_DIGEST, {}));
      expect(mockAlertDigest.generateDailyDigest).toHaveBeenCalledTimes(1);
    });

    it('invokes generateShiftSummary for SHIFT_SUMMARY', async () => {
      await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.SHIFT_SUMMARY, {}));
      expect(mockAlertDigest.generateShiftSummary).toHaveBeenCalledTimes(1);
    });

    it('returns the result from escalation service', async () => {
      mockEscalation.checkEscalations.mockResolvedValue({ escalated: 3 });
      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.ALERT_ESCALATION, {}));
      expect(result).toEqual({ escalated: 3 });
    });

    it('propagates errors from services', async () => {
      mockEscalation.checkEscalations.mockRejectedValue(new Error('DB failure'));
      await expect(handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.ALERT_ESCALATION, {}))).rejects.toThrow('DB failure');
    });
  });
});
