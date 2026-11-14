import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { OutboundGate } from '@appshore/kernel/infrastructure/outbound/outbound-gate.port';
import {
  allowAllOutboundGate,
  holdAllOutboundGate,
} from '@appshore/kernel/infrastructure/outbound/testing/outbound-gate.testing';
import type { PrismaService } from '../../../../database/prisma.service';
import { PushService } from '../web-push.service';
import { renderLogCalls } from '../../../../../test/helpers/rendered-log';

jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));

describe('PushService behind the outbound gate', () => {
  const config = {
    get: (key: string) => ({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })[key],
  } as unknown as ConfigService;
  const subscription = { id: 1, endpoint: 'https://push.example.com/a', p256dh: 'k', auth: 'a' };

  let prisma: { pushSubscription: { findMany: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = { pushSubscription: { findMany: jest.fn().mockResolvedValue([subscription]) } };
  });

  const service = (gate: OutboundGate) => new PushService(prisma as unknown as PrismaService, config, gate);

  it('sends nothing to a held-back user', async () => {
    const gate = holdAllOutboundGate();

    await expect(service(gate).sendPushToUser(5, { title: 'T', body: 'B' })).resolves.toBe(0);

    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(gate.held).toEqual([{ method: 'allowUser', recipient: 5 }]);
  });

  it('marks the title of an allowed send', async () => {
    const gate: OutboundGate = { ...allowAllOutboundGate(), markPushTitle: (title) => `[STG] ${title}` };

    await expect(service(gate).sendPushToUser(5, { title: 'T', body: 'B' })).resolves.toBe(1);

    expect(JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1])).toEqual({
      title: '[STG] T',
      body: 'B',
    });
  });

  it('logs a refused push as an err field the serializer masks, never in the message', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Received unexpected response code for person@example.com'), { statusCode: 400 }),
    );

    await expect(service(allowAllOutboundGate()).sendPushToUser(5, { title: 'T', body: 'B' })).resolves.toBe(0);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.any(String), err: expect.any(Object) }),
    );
    expect(renderLogCalls(errorSpy.mock.calls)).not.toContain('person@example.com');
    errorSpy.mockRestore();
  });
});
