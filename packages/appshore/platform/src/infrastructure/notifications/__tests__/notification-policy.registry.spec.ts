import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DeliveryChannel, NotificationCategory, NotificationType } from '@appshore/db';
import {
  CHANNEL_RULES,
  NOTIFICATION_POLICIES,
  NOTIFICATION_URGENCIES,
  policy,
  type NotificationPolicyMap,
} from '../notification-policy';
import { NotificationPolicyRegistry } from '../notification-policy.registry';
import { PLATFORM_NOTIFICATION_POLICIES } from '../platform-notification-policies';

describe('NotificationPolicyRegistry', () => {
  const appMap: NotificationPolicyMap = {
    [NotificationType.ROLE_CHANGED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.CRITICAL, {
      inApp: CHANNEL_RULES.ALWAYS,
      sms: CHANNEL_RULES.FALLBACK,
    }),
    [NotificationType.SETTINGS_UPDATED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.INFORMATIONAL, {
      email: CHANNEL_RULES.OPT_IN,
    }),
  };

  it('boots with no app map bound', () => {
    const registry = new NotificationPolicyRegistry();
    expect(registry.get(NotificationType.USER_JOINED)).toEqual(
      PLATFORM_NOTIFICATION_POLICIES[NotificationType.USER_JOINED],
    );
  });

  it('merges the app map over the platform map', () => {
    const registry = new NotificationPolicyRegistry(appMap);
    expect(registry.types()).toEqual(
      expect.arrayContaining([
        NotificationType.USER_JOINED,
        NotificationType.ROLE_CHANGED,
        NotificationType.SETTINGS_UPDATED,
      ]),
    );
    expect(registry.categoryOf(NotificationType.ROLE_CHANGED)).toBe(NotificationCategory.BILLING);
  });

  it('the app map overrides a platform type — an app may change how a foundation type behaves for its users', () => {
    const override = {
      [NotificationType.USER_JOINED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.TIMELY, {}),
    };
    expect(new NotificationPolicyRegistry(override).categoryOf(NotificationType.USER_JOINED)).toBe(
      NotificationCategory.BILLING,
    );
  });

  it('get() throws a Nest exception for an undeclared type — it can surface from an HTTP-triggered send', () => {
    const registry = new NotificationPolicyRegistry();
    expect(() => registry.get('NOT_A_TYPE' as NotificationType)).toThrow(InternalServerErrorException);
  });

  it('receives the app map through the NOTIFICATION_POLICIES token under Nest DI', async () => {
    const module = await Test.createTestingModule({
      providers: [NotificationPolicyRegistry, { provide: NOTIFICATION_POLICIES, useValue: appMap }],
    }).compile();
    expect(module.get(NotificationPolicyRegistry).categoryOf(NotificationType.ROLE_CHANGED)).toBe(
      NotificationCategory.BILLING,
    );
  });

  it('boots under Nest DI with the token unbound', async () => {
    const module = await Test.createTestingModule({ providers: [NotificationPolicyRegistry] }).compile();
    expect(module.get(NotificationPolicyRegistry).types()).toContain(NotificationType.USER_JOINED);
  });

  it('isCritical() reads the urgency', () => {
    const registry = new NotificationPolicyRegistry(appMap);
    expect(registry.isCritical(NotificationType.ROLE_CHANGED)).toBe(true);
    expect(registry.isCritical(NotificationType.SETTINGS_UPDATED)).toBe(false);
  });

  describe('offeredChannels()', () => {
    it('unions rules across a category and drops never', () => {
      const registry = new NotificationPolicyRegistry(appMap);
      const offered = registry.offeredChannels(NotificationCategory.BILLING);
      expect(offered[DeliveryChannel.WHATSAPP]).toBeUndefined();
      expect(offered[DeliveryChannel.EMAIL]).toBe(CHANNEL_RULES.OPT_IN);
      expect(offered[DeliveryChannel.SMS]).toBe(CHANNEL_RULES.FALLBACK);
    });

    it('prefers the rule that is on when the user has not chosen: always > default > fallback > optIn', () => {
      const registry = new NotificationPolicyRegistry(appMap);
      const offered = registry.offeredChannels(NotificationCategory.BILLING);
      expect(offered[DeliveryChannel.IN_APP]).toBe(CHANNEL_RULES.ALWAYS);
      expect(offered[DeliveryChannel.PUSH]).toBe(CHANNEL_RULES.DEFAULT);
    });

    it('is empty for a category no type uses', () => {
      expect(new NotificationPolicyRegistry().offeredChannels(NotificationCategory.BILLING)).toEqual({});
    });
  });
});
