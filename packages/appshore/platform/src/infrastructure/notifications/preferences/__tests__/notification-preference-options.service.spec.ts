import { NotificationCategory } from '@appshore/db';
import { PlatformNotificationType } from '@app/shared-types';
import { NotificationPreferenceOptionsService } from '../notification-preference-options.service';
import { NotificationPolicyRegistry } from '../../notification-policy.registry';
import { CHANNEL_RULES, NOTIFICATION_URGENCIES, policy } from '../../notification-policy';

const { ALWAYS, DEFAULT, OPT_IN, FALLBACK, NEVER } = CHANNEL_RULES;

describe('NotificationPreferenceOptionsService', () => {
  const registry = new NotificationPolicyRegistry({
    [PlatformNotificationType.ROLE_CHANGED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.CRITICAL, {
      inApp: ALWAYS,
      sms: FALLBACK,
      whatsapp: NEVER,
    }),
    [PlatformNotificationType.SETTINGS_UPDATED]: policy(
      NotificationCategory.BILLING,
      NOTIFICATION_URGENCIES.INFORMATIONAL,
      {
        email: OPT_IN,
      },
    ),
  });
  const service = new NotificationPreferenceOptionsService(registry);
  const billing = () => service.list().categories.find((c) => c.category === NotificationCategory.BILLING)!;

  it('offers only categories some policy uses, platform categories first', () => {
    const keys = service.list().categories.map((c) => c.key);
    expect(keys).toEqual(['system', 'team', 'billing']);
  });

  it('reports the most permissive rule per channel and omits never', () => {
    expect(billing().channels).toEqual({ inApp: ALWAYS, push: DEFAULT, email: OPT_IN, sms: FALLBACK });
    expect(billing().channels).not.toHaveProperty('whatsapp');
  });

  it('defaults are on for every offered channel except optIn, which starts off', () => {
    expect(billing().defaults).toEqual({ inApp: true, push: true, email: false, sms: true });
  });

  it('keys categories the way preferences are stored', () => {
    expect(service.list().categories.map((c) => c.key)).toEqual(
      service.list().categories.map((c) => c.category.toLowerCase()),
    );
  });

  it('computes once', () => {
    expect(service.list()).toBe(service.list());
  });
});
