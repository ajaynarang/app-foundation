import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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

      await expect(controller.replayEvents(user, 'sub-1', { since })).rejects.toThrow(BadRequestException);

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
