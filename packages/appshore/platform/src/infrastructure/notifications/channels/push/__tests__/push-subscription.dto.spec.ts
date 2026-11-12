import { fieldErrorsOf, readBodyDto } from '../../../../../test/helpers/field-errors.helpers';
import { SubscribePushDto, UnsubscribePushDto } from '../dto/push-subscription.dto';

describe('push subscription bodies', () => {
  // What a browser's `PushSubscription.toJSON()` sends.
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    expirationTime: null,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };

  it('accepts a browser subscription as it is', async () => {
    const dto = await readBodyDto(SubscribePushDto, { subscription });
    expect(dto.subscription).toMatchObject({ endpoint: subscription.endpoint, keys: subscription.keys });
  });

  it('answers 400 naming the missing piece; the body was an inline type with no check before', async () => {
    expect(await fieldErrorsOf(readBodyDto(SubscribePushDto, {}))).toHaveProperty('subscription');
    const noKeys = await fieldErrorsOf(readBodyDto(SubscribePushDto, { subscription: { endpoint: 'https://x' } }));
    expect(Object.keys(noKeys).some((field) => field.startsWith('subscription.keys'))).toBe(true);
    const noAuth = await fieldErrorsOf(
      readBodyDto(SubscribePushDto, { subscription: { ...subscription, keys: { p256dh: 'k' } } }),
    );
    expect(Object.keys(noAuth)).toContain('subscription.keys.auth');
  });

  it('unsubscribe needs the endpoint', async () => {
    expect(await readBodyDto(UnsubscribePushDto, { endpoint: subscription.endpoint })).toEqual({
      endpoint: subscription.endpoint,
    });
    expect(await fieldErrorsOf(readBodyDto(UnsubscribePushDto, {}))).toHaveProperty('endpoint');
    expect(await fieldErrorsOf(readBodyDto(UnsubscribePushDto, { endpoint: '' }))).toHaveProperty('endpoint');
  });
});
