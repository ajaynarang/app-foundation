import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DeliveryChannel, NotificationCategory } from '@appshore/db';
import { PLATFORM_NOTIFICATION_TYPES, PlatformNotificationType, type NotificationType } from '@app/shared-types';
import {
  CHANNEL_RULES,
  NOTIFICATION_POLICIES,
  NOTIFICATION_TYPES,
  NOTIFICATION_URGENCIES,
  policy,
  type NotificationPolicyMap,
} from '../notification-policy';
import { NotificationPolicyRegistry } from '../notification-policy.registry';
import { PLATFORM_NOTIFICATION_POLICIES } from '../platform-notification-policies';

describe('NotificationPolicyRegistry', () => {
  const appMap: NotificationPolicyMap = {
    [PlatformNotificationType.ROLE_CHANGED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.CRITICAL, {
      inApp: CHANNEL_RULES.ALWAYS,
      sms: CHANNEL_RULES.FALLBACK,
    }),
    [PlatformNotificationType.SETTINGS_UPDATED]: policy(
      NotificationCategory.BILLING,
      NOTIFICATION_URGENCIES.INFORMATIONAL,
      {
        email: CHANNEL_RULES.OPT_IN,
      },
    ),
  };

  it('boots with no app map bound', () => {
    const registry = new NotificationPolicyRegistry();
    expect(registry.get(PlatformNotificationType.USER_JOINED)).toEqual(
      PLATFORM_NOTIFICATION_POLICIES[PlatformNotificationType.USER_JOINED],
    );
  });

  it('merges the app map over the platform map', () => {
    const registry = new NotificationPolicyRegistry(appMap);
    expect(registry.types()).toEqual(
      expect.arrayContaining([
        PlatformNotificationType.USER_JOINED,
        PlatformNotificationType.ROLE_CHANGED,
        PlatformNotificationType.SETTINGS_UPDATED,
      ]),
    );
    expect(registry.categoryOf(PlatformNotificationType.ROLE_CHANGED)).toBe(NotificationCategory.BILLING);
  });

  it('the app map overrides a platform type — an app may change how a foundation type behaves for its users', () => {
    const override = {
      [PlatformNotificationType.USER_JOINED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.TIMELY, {}),
    };
    expect(new NotificationPolicyRegistry(override).categoryOf(PlatformNotificationType.USER_JOINED)).toBe(
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
    expect(module.get(NotificationPolicyRegistry).categoryOf(PlatformNotificationType.ROLE_CHANGED)).toBe(
      NotificationCategory.BILLING,
    );
  });

  it('boots under Nest DI with the token unbound', async () => {
    const module = await Test.createTestingModule({ providers: [NotificationPolicyRegistry] }).compile();
    expect(module.get(NotificationPolicyRegistry).types()).toContain(PlatformNotificationType.USER_JOINED);
  });

  it('isCritical() reads the urgency', () => {
    const registry = new NotificationPolicyRegistry(appMap);
    expect(registry.isCritical(PlatformNotificationType.ROLE_CHANGED)).toBe(true);
    expect(registry.isCritical(PlatformNotificationType.SETTINGS_UPDATED)).toBe(false);
  });

  describe("the app's declared types (NOTIFICATION_TYPES): the registry refuses to boot on a gap", () => {
    const invoiceOverdue = policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.TIMELY, {
      email: CHANNEL_RULES.DEFAULT,
    });

    it('knows the platform types and the app types, and nothing else', () => {
      const registry = new NotificationPolicyRegistry({ INVOICE_OVERDUE: invoiceOverdue }, ['INVOICE_OVERDUE']);
      expect([...registry.types()].sort()).toEqual([...PLATFORM_NOTIFICATION_TYPES, 'INVOICE_OVERDUE'].sort());
      expect(registry.categoryOf('INVOICE_OVERDUE')).toBe(NotificationCategory.BILLING);
    });

    it('refuses a declared app type with no policy', () => {
      expect(() => new NotificationPolicyRegistry({}, ['INVOICE_OVERDUE'])).toThrow(
        /INVOICE_OVERDUE.*has no policy.*NOTIFICATION_POLICIES/,
      );
    });

    it('refuses a policy for a type nobody declared', () => {
      expect(() => new NotificationPolicyRegistry({ INVOICE_OVERDUE: invoiceOverdue })).toThrow(
        /policy for INVOICE_OVERDUE.*not declared.*notification-types\.ts/,
      );
    });

    it('refuses an app type that repeats a platform type, or itself', () => {
      expect(() => new NotificationPolicyRegistry({}, [PlatformNotificationType.USER_JOINED])).toThrow(
        /USER_JOINED is declared twice/,
      );
      expect(
        () =>
          new NotificationPolicyRegistry({ INVOICE_OVERDUE: invoiceOverdue }, ['INVOICE_OVERDUE', 'INVOICE_OVERDUE']),
      ).toThrow(/INVOICE_OVERDUE is declared twice/);
    });

    it('refuses an app type the VarChar(60) column could not store', () => {
      const long = 'A'.repeat(61);
      expect(() => new NotificationPolicyRegistry({ [long]: invoiceOverdue }, [long])).toThrow(
        /not a valid notification type/,
      );
    });

    it('receives the declared types through the NOTIFICATION_TYPES token under Nest DI, and fails the boot on a gap', async () => {
      const ok = await Test.createTestingModule({
        providers: [
          NotificationPolicyRegistry,
          { provide: NOTIFICATION_POLICIES, useValue: { INVOICE_OVERDUE: invoiceOverdue } },
          { provide: NOTIFICATION_TYPES, useValue: ['INVOICE_OVERDUE'] },
        ],
      }).compile();
      expect(ok.get(NotificationPolicyRegistry).types()).toContain('INVOICE_OVERDUE');

      await expect(
        Test.createTestingModule({
          providers: [NotificationPolicyRegistry, { provide: NOTIFICATION_TYPES, useValue: ['INVOICE_OVERDUE'] }],
        }).compile(),
      ).rejects.toThrow(/INVOICE_OVERDUE.*has no policy/);
    });
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
