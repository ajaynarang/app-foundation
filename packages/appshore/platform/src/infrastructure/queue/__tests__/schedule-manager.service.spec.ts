import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobVocabulary, EMPTY_APP_JOB_VOCABULARY } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import { ScheduleManagerService } from '../schedule-manager.service';
import { PrismaService } from '../../database/prisma.service';
import { JOB_VOCABULARY } from '../job-vocabulary.token';

const queueMock = () => ({
  getRepeatableJobs: jest.fn().mockResolvedValue([{ name: 'report-build', key: 'old-key' }]),
  removeRepeatableByKey: jest.fn().mockResolvedValue(true),
  add: jest.fn().mockResolvedValue({}),
});

const schedule = (category: string, jobType: string) => ({
  id: 1,
  category,
  jobType,
  isEnabled: true,
  scheduleType: 'cron',
  pattern: '0 * * * *',
  intervalMs: null,
});

describe('ScheduleManagerService reads the merged job vocabulary', () => {
  const prisma = { jobSchedule: { findUnique: jest.fn() } };
  const reports = queueMock();
  const bulkOps = queueMock();

  async function build(withApp: boolean) {
    const vocabulary = withApp
      ? buildJobVocabulary({
          ...EMPTY_APP_JOB_VOCABULARY,
          queueNames: { REPORTS: 'reports' },
          jobNames: { REPORTS: { BUILD: 'report-build' } },
          categories: {
            reports: { display: 'Reports', queue: 'reports', requiredIntegration: null, tenantVisible: false },
          },
        })
      : undefined;
    const module = await Test.createTestingModule({
      providers: [
        ScheduleManagerService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken('reports'), useValue: reports },
        { provide: getQueueToken(QUEUE_NAMES.BULK_OPS), useValue: bulkOps },
        ...(vocabulary ? [{ provide: JOB_VOCABULARY, useValue: vocabulary }] : []),
      ],
    }).compile();
    return module.get(ScheduleManagerService);
  }

  beforeEach(() => jest.clearAllMocks());

  it("reloads an app category's schedule on the app's own queue", async () => {
    prisma.jobSchedule.findUnique.mockResolvedValue(schedule('reports', 'report-build'));
    const service = await build(true);

    await service.reloadSchedule('reports', 'report-build');

    expect(reports.removeRepeatableByKey).toHaveBeenCalledWith('old-key');
    expect(reports.add).toHaveBeenCalledWith(
      'report-build',
      expect.objectContaining({ tenantId: 'system', metadata: expect.objectContaining({ source: 'cron' }) }),
      expect.objectContaining({ repeat: { pattern: '0 * * * *' }, jobId: 'reports-report-build' }),
    );
  });

  it('still reloads a kernel category on its kernel queue', async () => {
    prisma.jobSchedule.findUnique.mockResolvedValue(schedule('maintenance', 'job-cleanup'));
    const service = await build(true);

    await service.reloadSchedule('maintenance', 'job-cleanup');

    expect(bulkOps.add).toHaveBeenCalledWith(
      'job-cleanup',
      expect.objectContaining({ tenantId: 'system' }),
      expect.objectContaining({ jobId: 'maintenance-job-cleanup' }),
    );
  });

  it('does nothing for a category no vocabulary declares', async () => {
    prisma.jobSchedule.findUnique.mockResolvedValue(schedule('reports', 'report-build'));
    const service = await build(false);

    await service.reloadSchedule('reports', 'report-build');

    expect(reports.add).not.toHaveBeenCalled();
  });
});
