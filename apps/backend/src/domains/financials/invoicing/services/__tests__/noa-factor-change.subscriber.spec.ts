import { Test, TestingModule } from '@nestjs/testing';
import { NoaFactorChangeSubscriber } from '../noa-factor-change.subscriber';
import { NoaService } from '../noa.service';

describe('NoaFactorChangeSubscriber', () => {
  let subscriber: NoaFactorChangeSubscriber;
  let noaService: { bulkCreateForFactorChange: jest.Mock };

  beforeEach(async () => {
    noaService = {
      bulkCreateForFactorChange: jest.fn().mockResolvedValue({ created: 3, skipped: 1, customerIds: [1, 2, 3, 4] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NoaFactorChangeSubscriber, { provide: NoaService, useValue: noaService }],
    }).compile();

    subscriber = module.get(NoaFactorChangeSubscriber);
  });

  const buildEvent = (newFactoringCompanyId: number | null, tenantId: string | number = '1') => ({
    eventName: 'sally.tenant.factoring-default-changed',
    tenantId: String(tenantId),
    data: {
      previousFactoringCompanyId: null,
      newFactoringCompanyId,
      changedBy: 'user_42',
    },
    actor: null,
    timestamp: new Date(),
  });

  it('triggers bulk create when newFactoringCompanyId is non-null', async () => {
    await subscriber.onTenantFactoringDefaultChanged(buildEvent(7) as any);

    expect(noaService.bulkCreateForFactorChange).toHaveBeenCalledWith(1, 7);
  });

  it('skips bulk create when factor is unpinned (newFactoringCompanyId = null)', async () => {
    await subscriber.onTenantFactoringDefaultChanged(buildEvent(null) as any);

    expect(noaService.bulkCreateForFactorChange).not.toHaveBeenCalled();
  });

  it('logs warn but does NOT re-throw when bulk create fails (event handlers must not crash bus)', async () => {
    noaService.bulkCreateForFactorChange.mockRejectedValue(new Error('DB down'));

    await expect(subscriber.onTenantFactoringDefaultChanged(buildEvent(7) as any)).resolves.toBeUndefined();
  });

  it('skips when tenantId on the event is non-numeric (defensive)', async () => {
    await subscriber.onTenantFactoringDefaultChanged(buildEvent(7, 'not-a-number') as any);

    expect(noaService.bulkCreateForFactorChange).not.toHaveBeenCalled();
  });
});
