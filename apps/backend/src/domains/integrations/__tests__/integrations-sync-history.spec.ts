import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
import { IntegrationsService, MAX_ACTIVE_SYNCS_SHOWN } from '../integrations.service';

/** Sync history is read from the jobs table: the lists page by cursor and name a run by its public id. */
describe('IntegrationsService sync history', () => {
  // A scheduler fans out several sync jobs in one millisecond. One job is another tenant's, one failed.
  const stamps = tiedTimestamps(8);
  const jobs = stamps.map((createdAt, index) => ({
    id: index + 1,
    publicId: `0190f1c2-0000-7000-8000-00000000000${(index * 5) % 8}`,
    tenantId: index === 7 ? 99 : 1,
    category: 'vendor',
    type: 'orders',
    status: index === 0 ? 'FAILED' : 'COMPLETED',
    inputData: { integrationId: 5, triggerSource: 'manual' },
    resultData: { recordsProcessed: 3 },
    startedAt: createdAt,
    completedAt: new Date(createdAt.getTime() + 500),
    errorMessage: null,
    errorDetails: null,
    createdAt,
  }));
  let prisma: any;
  let service: IntegrationsService;

  beforeEach(() => {
    prisma = {
      job: fixtureModel(jobs),
      integrationConfig: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 5, vendor: 'ACME_ERP', integrationType: 'ERP', displayName: 'Acme ERP' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 5, vendor: 'ACME_ERP', integrationType: 'ERP', displayName: 'X' }),
      },
    };
    service = new IntegrationsService(prisma, {} as never, {} as never, {} as never, {} as never);
  });

  it('walks every sync run of the tenant once, runs of one millisecond included', async () => {
    const totals: number[] = [];
    const { pages, items } = await walkCursorList(async (cursor) => {
      const page = await service.getUnifiedSyncHistory(1, { limit: 3, cursor });
      totals.push(page.total);
      return page;
    });

    expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
    expect(new Set(items.map((item) => item.id)).size).toBe(7);
    expect(totals).toEqual([7, 7, 7]);
    const times = items.map((item) => Date.parse(item.startedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('names a run by its public id, never the job Int key, and shows the integration it ran for', async () => {
    const { items } = await service.getUnifiedSyncHistory(1, { limit: 1 });
    expect(jobs.map((job) => job.publicId)).toContain(items[0].id);
    expect(typeof items[0].id).toBe('string');
    expect(items[0].status).toBe('success');
    expect(items[0]).toMatchObject({ vendor: 'ACME_ERP', displayName: 'Acme ERP', triggerSource: 'manual' });
  });

  it('maps the wire status to job statuses, and counts only what matches', async () => {
    const failed = await service.getUnifiedSyncHistory(1, { status: 'failed' });
    expect(failed.items.map((item) => item.status)).toEqual(['failed']);
    expect(failed.total).toBe(1);

    await service.getUnifiedSyncHistory(1, { status: 'running' });
    const lastWhere = prisma.job.findMany.mock.calls.at(-1)[0].where;
    expect(lastWhere.status).toEqual({ in: ['QUEUED', 'PROCESSING'] });
  });

  it('pages one integration, after checking it belongs to the tenant', async () => {
    const jobFindMany = jest.fn().mockResolvedValue([jobs[1], jobs[2]]);
    prisma.job = { findMany: jobFindMany, count: jest.fn().mockResolvedValue(2) };

    const page = await service.getSyncHistory('int_abc', 1, { limit: 1 });

    expect(prisma.integrationConfig.findFirst).toHaveBeenCalledWith({
      where: { integrationId: 'int_abc', tenantId: 1 },
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    expect(page.total).toBe(2);
    expect(jobFindMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
      take: 2,
    });
  });

  it('answers 400 on a cursor it did not issue, before any query runs', async () => {
    await expect(service.getUnifiedSyncHistory(1, { cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
    expect(prisma.job.findMany).not.toHaveBeenCalled();
  });

  it('reads the syncs in flight for the health summary with a ceiling', async () => {
    prisma.job = { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) };
    prisma.integrationConfig.findMany.mockResolvedValue([]);

    await service.getHealthSummary(1);

    expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: MAX_ACTIVE_SYNCS_SHOWN }));
  });
});
