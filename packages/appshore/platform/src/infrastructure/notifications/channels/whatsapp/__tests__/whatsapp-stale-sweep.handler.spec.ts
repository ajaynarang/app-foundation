import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { DeliveryLedgerService } from '../../../pipeline/delivery-ledger.service';
import { WhatsAppStaleSweepHandler } from '../whatsapp-stale-sweep.handler';

describe('WhatsAppStaleSweepHandler', () => {
  let handler: WhatsAppStaleSweepHandler;
  const ledger = { staleQueued: jest.fn(), markQueueLost: jest.fn().mockResolvedValue(0) };
  const job = { id: 'j', name: 'whatsapp-stale-sweep', data: { payload: {} } } as unknown as Job<JobEnvelope<unknown>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WhatsAppStaleSweepHandler, { provide: DeliveryLedgerService, useValue: ledger }],
    }).compile();
    handler = module.get(WhatsAppStaleSweepHandler);
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T12:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('asks for never-ran rows older than 15 minutes and never-acknowledged rows older than 24 hours', async () => {
    ledger.staleQueued.mockResolvedValue([]);
    await handler.run(job);
    expect(ledger.staleQueued).toHaveBeenCalledWith({ olderThan: new Date('2026-08-31T11:45:00Z'), claimed: false });
    expect(ledger.staleQueued).toHaveBeenCalledWith({ olderThan: new Date('2026-08-30T12:00:00Z'), claimed: true });
  });

  it('closes every stranded row as QUEUE_LOST and reports the split', async () => {
    ledger.staleQueued.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]).mockResolvedValueOnce([{ id: 'c' }]);
    await expect(handler.run(job)).resolves.toEqual({ unclaimed: 2, claimed: 1 });
    expect(ledger.markQueueLost).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('touches nothing when nothing is stranded', async () => {
    ledger.staleQueued.mockResolvedValue([]);
    await expect(handler.run(job)).resolves.toEqual({ unclaimed: 0, claimed: 0 });
    expect(ledger.markQueueLost).not.toHaveBeenCalled();
  });
});
