import { IntegrationsController } from '../integrations.controller';

/**
 * `POST /integrations/:integration_id/sync` answers 202 with the job to poll. The job is named by its public id:
 * an Int primary key never crosses the API (ADR "ID boundary"), and the sync-history rows name runs the same way.
 */
describe('IntegrationsController.triggerSync', () => {
  const job = { id: 41, publicId: '0190f3a2-8c1e-7b3a-9d4f-2a6c8e1b5d70' };
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 3 }) },
    integrationConfig: {
      findFirst: jest.fn().mockResolvedValue({ id: 9, tenantId: 3, integrationType: 'ACCOUNTING' }),
    },
  };
  const jobService = { createJob: jest.fn().mockResolvedValue(job) };
  const bulkOpsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const controller = new IntegrationsController(
    {} as never,
    prisma as never,
    jobService as never,
    bulkOpsQueue as never,
  );

  it('answers the queued job by its public id, never the Int key', async () => {
    const result = await controller.triggerSync('int_abc', { user: { tenantDbId: 3, dbId: 5 } });
    expect(result).toEqual({ jobId: job.publicId, status: 'QUEUED' });
  });
});
