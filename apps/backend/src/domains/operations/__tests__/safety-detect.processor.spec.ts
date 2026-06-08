import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { LoadMonitoringJobHandler } from '../safety-detect.processor';
import { LoadMonitoringService } from '../monitoring/services/load-monitoring.service';
import { SAFETY_DETECT_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';

function makeEnvelope<P>(payload: P): JobEnvelope<P> {
  return {
    tenantId: 'system',
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'cron', version: 1 },
  };
}

function makeJob<P>(name: string, payload: P): Job<JobEnvelope<P>> {
  return { id: 'j1', name, data: makeEnvelope(payload) } as unknown as Job<JobEnvelope<P>>;
}

describe('LoadMonitoringJobHandler', () => {
  let processor: LoadMonitoringJobHandler;

  const mockLoadMonitoring = {
    monitorActiveLoads: jest.fn().mockResolvedValue({ checked: 0 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoadMonitoringJobHandler, { provide: LoadMonitoringService, useValue: mockLoadMonitoring }],
    }).compile();

    processor = module.get<LoadMonitoringJobHandler>(LoadMonitoringJobHandler);
    jest.clearAllMocks();
  });

  it('owns the LOAD_MONITORING job name so the dispatcher can route to it', () => {
    expect(processor.jobNames).toContain(SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING);
  });

  describe('run', () => {
    it('invokes monitorActiveLoads', async () => {
      await processor.run(makeJob(SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING, {}));
      expect(mockLoadMonitoring.monitorActiveLoads).toHaveBeenCalledTimes(1);
    });

    it('returns the result from the load monitoring service', async () => {
      mockLoadMonitoring.monitorActiveLoads.mockResolvedValue({ checked: 5 });
      const result = await processor.run(makeJob(SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING, {}));
      expect(result).toEqual({ checked: 5 });
    });

    it('propagates service errors so BullMQ records the attempt', async () => {
      mockLoadMonitoring.monitorActiveLoads.mockRejectedValue(new Error('DB unavailable'));
      await expect(processor.run(makeJob(SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING, {}))).rejects.toThrow(
        'DB unavailable',
      );
    });
  });
});
