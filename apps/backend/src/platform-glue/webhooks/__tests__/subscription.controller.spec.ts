import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { WebhookListQueryDto, WebhookLogListQueryDto } from '../dto/webhook-list-query.dto';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SubscriptionController } from '../subscription.controller';
import { DOMAIN_EVENTS } from '../../events/domain-events.constants';

describe('SubscriptionController', () => {
  const user = { tenantDbId: 1 };
  let service: any;
  let dispatcher: any;
  let controller: SubscriptionController;

  beforeEach(() => {
    service = {
      findOne: jest.fn().mockResolvedValue({ id: 'sub-1', tenantId: 1 }),
      getDeliveryLog: jest.fn(),
      replayEvents: jest.fn(),
      softDelete: jest.fn().mockResolvedValue({ id: 'sub-1', active: false }),
    };
    dispatcher = { deliverToSubscription: jest.fn() };
    controller = new SubscriptionController(service, dispatcher);
  });

  describe('POST /webhooks/:id/test', () => {
    it('answers the queued delivery, the record to poll', async () => {
      const log = { id: 'log-9', subscriptionId: 'sub-1', failedAt: null, deliveredAt: null };
      dispatcher.deliverToSubscription.mockResolvedValue('log-9');
      service.getDeliveryLog.mockResolvedValue(log);

      await expect(controller.test(user, 'sub-1')).resolves.toBe(log);

      expect(dispatcher.deliverToSubscription).toHaveBeenCalledWith(
        'sub-1',
        DOMAIN_EVENTS.NOTIFICATION_CREATED,
        expect.objectContaining({ test: true }),
      );
      expect(service.getDeliveryLog).toHaveBeenCalledWith(1, 'sub-1', 'log-9');
    });

    it('answers 503 when the test event could not be queued, and reads no delivery', async () => {
      dispatcher.deliverToSubscription.mockResolvedValue(null);

      await expect(controller.test(user, 'sub-1')).rejects.toThrow(ServiceUnavailableException);

      expect(service.getDeliveryLog).not.toHaveBeenCalled();
    });

    it("sends nothing to another tenant's subscription", async () => {
      service.findOne.mockRejectedValue(new NotFoundException('Webhook subscription not found'));

      await expect(controller.test({ tenantDbId: 2 }, 'sub-1')).rejects.toThrow(NotFoundException);

      expect(service.findOne).toHaveBeenCalledWith(2, 'sub-1');
      expect(dispatcher.deliverToSubscription).not.toHaveBeenCalled();
    });
  });

  describe('POST /webhooks/:id/replay', () => {
    it('answers how many deliveries were queued and from when', async () => {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const dto = { since };
      service.replayEvents.mockResolvedValue({ queued: 3, since });

      await expect(controller.replayEvents(user, 'sub-1', dto)).resolves.toEqual({ queued: 3, since });

      expect(service.replayEvents).toHaveBeenCalledWith(1, 'sub-1', dto);
    });

    it('refuses a window longer than 7 days before anything is queued', async () => {
      const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

      expect(await fieldErrorsOf(controller.replayEvents(user, 'sub-1', { since }))).toHaveProperty('since');

      expect(service.replayEvents).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /webhooks/:id', () => {
    it('answers no body', async () => {
      await expect(controller.remove(user, 'sub-1')).resolves.toBeUndefined();

      expect(service.softDelete).toHaveBeenCalledWith(1, 'sub-1');
    });
  });
});

describe('webhook list query DTOs', () => {
  it('pages with limit (1…100, default 20) and offset', async () => {
    expect(await readQueryDto(WebhookListQueryDto, {})).toMatchObject({ limit: 20, offset: 0 });
    expect(await readQueryDto(WebhookListQueryDto, { limit: '500', offset: '40' })).toMatchObject({
      limit: 100,
      offset: 40,
    });
  });

  it('answers 400 naming limit or offset when it is not a whole number', async () => {
    expect(await fieldErrorsOf(readQueryDto(WebhookListQueryDto, { limit: 'abc' }))).toHaveProperty('limit');
    expect(await fieldErrorsOf(readQueryDto(WebhookListQueryDto, { offset: '-1' }))).toHaveProperty('offset');
  });

  it('reads date_from and date_to as YYYY-MM-DD and refuses the old dateFrom and dateTo', async () => {
    const read = (raw: Record<string, unknown>) => readQueryDto(WebhookLogListQueryDto, raw);
    expect(await read({ date_from: '2026-04-01', date_to: '2026-04-30' })).toMatchObject({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    });
    expect(await fieldErrorsOf(read({ date_from: '04/01/2026' }))).toHaveProperty('date_from');
    expect(await fieldErrorsOf(read({ dateFrom: '2026-04-01' }))).toHaveProperty('dateFrom');
    expect(await fieldErrorsOf(read({ dateTo: '2026-04-30' }))).toHaveProperty('dateTo');
  });
});
