import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationType } from '@appshore/db';
import { WHATSAPP_QUEUE_NAME } from '../whatsapp.constants';
import { WhatsAppDispatchService } from '../whatsapp-dispatch.service';

describe('WhatsAppDispatchService', () => {
  let service: WhatsAppDispatchService;
  const queue = { addBulk: jest.fn().mockResolvedValue([]) };
  const send = { templateName: 'tx_draw_published_v1', languageCode: 'en', bodyValues: ['x', 'c'] };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WhatsAppDispatchService, { provide: getQueueToken(WHATSAPP_QUEUE_NAME), useValue: queue }],
    }).compile();
    service = module.get(WhatsAppDispatchService);
    jest.clearAllMocks();
  });

  it('adds one job per pending send — deterministic id, five attempts, exponential backoff, no phone in the payload', async () => {
    await service.enqueue(
      [
        { deliveryId: 'd1', userId: 7, send },
        { deliveryId: 'd2', userId: 8, send },
      ],
      { tenantId: 1, type: NotificationType.INTEGRATION_SYNC_COMPLETED },
    );

    expect(queue.addBulk).toHaveBeenCalledTimes(1);
    const [jobs] = queue.addBulk.mock.calls[0];
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      name: 'whatsapp-send',
      data: { tenantId: '1', payload: { deliveryId: 'd1', userId: 7, type: 'INTEGRATION_SYNC_COMPLETED', send } },
      opts: { jobId: 'whatsapp-d1', attempts: 5, backoff: { type: 'exponential', delay: 30000 } },
    });
    expect(jobs[1].opts.jobId).toBe('whatsapp-d2');
    expect(JSON.stringify(jobs)).not.toMatch(/\+91|phone/);
  });

  it('an empty list adds nothing', async () => {
    await service.enqueue([], { tenantId: 1, type: NotificationType.INTEGRATION_SYNC_COMPLETED });
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('an enqueue failure is logged, not thrown — the rows stay QUEUED for the stale sweep', async () => {
    queue.addBulk.mockRejectedValueOnce(new Error('redis down'));
    await expect(
      service.enqueue([{ deliveryId: 'd1', userId: 7, send }], {
        tenantId: 1,
        type: NotificationType.INTEGRATION_SYNC_COMPLETED,
      }),
    ).resolves.toBeUndefined();
  });
});
