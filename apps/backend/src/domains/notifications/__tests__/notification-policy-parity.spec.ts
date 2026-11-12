import { DeliveryChannel } from '@appshore/db';
import { PLATFORM_NOTIFICATION_TYPES } from '@app/shared-types';
import { CHANNEL_RULES } from '@appshore/platform/infrastructure/notifications/notification-policy';
import { NotificationPolicyRegistry } from '@appshore/platform/infrastructure/notifications/notification-policy.registry';
import { WhatsAppTemplateRegistry } from '@appshore/platform/infrastructure/notifications/channels/whatsapp/whatsapp-template.registry';
import { APP_NOTIFICATION_TYPES } from '../../../platform-glue/notifications/notification-types';
import {
  APP_NOTIFICATION_POLICIES,
  APP_WHATSAPP_TEMPLATES,
} from '../../../platform-glue/notifications/app-notification-policies';

/**
 * The one parity guard for notification types. It reads the declared-types registry the app binds in
 * platform-glue/hooks.module.ts (PLATFORM_NOTIFICATION_TYPES plus APP_NOTIFICATION_TYPES) with the app's real policy
 * and template maps: every declared type has exactly one policy, and a WhatsApp rule is only on where a
 * Meta-approved template exists. The registry itself refuses to boot on the first gap; this spec fails before a
 * push.
 */
describe('notification policy parity', () => {
  const build = () => new NotificationPolicyRegistry(APP_NOTIFICATION_POLICIES, APP_NOTIFICATION_TYPES);
  const templates = new WhatsAppTemplateRegistry(APP_WHATSAPP_TEMPLATES);
  const everyType: string[] = [...PLATFORM_NOTIFICATION_TYPES, ...APP_NOTIFICATION_TYPES];

  it('the registry boots with the app bindings: no declared type lacks a policy, no policy lacks a type', () => {
    expect(build).not.toThrow();
  });

  it('every declared type, platform and app, has exactly one policy', () => {
    const registry = build();
    expect([...registry.types()].sort()).toEqual([...everyType].sort());
    for (const type of everyType) expect(registry.get(type)).toBeDefined();
  });

  it('a WhatsApp rule other than never has a registered template', () => {
    const registry = build();
    const promisedWithoutTemplate = everyType.filter(
      (type) => registry.get(type).channels[DeliveryChannel.WHATSAPP] !== CHANNEL_RULES.NEVER && !templates.has(type),
    );
    expect(promisedWithoutTemplate).toEqual([]);
  });
});
