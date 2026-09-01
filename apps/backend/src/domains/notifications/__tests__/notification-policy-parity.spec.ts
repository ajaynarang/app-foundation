import { DeliveryChannel, NotificationType } from '@appshore/db';
import { CHANNEL_RULES } from '@appshore/platform/infrastructure/notifications/notification-policy';
import { NotificationPolicyRegistry } from '@appshore/platform/infrastructure/notifications/notification-policy.registry';
import { WhatsAppTemplateRegistry } from '@appshore/platform/infrastructure/notifications/channels/whatsapp/whatsapp-template.registry';

/**
 * Bind your app's map to NOTIFICATION_POLICIES and templates to WHATSAPP_TEMPLATES in
 * platform-glue/hooks.module.ts, then pass them here: every NotificationType must have a policy,
 * and a WhatsApp rule may only be on where a Meta-approved template exists.
 */
describe('notification policy parity', () => {
  const registry = new NotificationPolicyRegistry({});
  const templates = new WhatsAppTemplateRegistry({});
  const everyType = Object.values(NotificationType);

  it('every NotificationType has exactly one policy', () => {
    expect(registry.types().sort()).toEqual([...everyType].sort());
  });

  it('a WhatsApp rule other than never has a registered template', () => {
    const promisedWithoutTemplate = everyType.filter(
      (type) => registry.get(type).channels[DeliveryChannel.WHATSAPP] !== CHANNEL_RULES.NEVER && !templates.has(type),
    );
    expect(promisedWithoutTemplate).toEqual([]);
  });
});
