import { NotificationCategory, NotificationType, UserRole } from '@appshore/db';
import { NotificationPreferenceOptionsService } from '../notification-preference-options.service';
import { NotificationPolicyRegistry } from '../../notification-policy.registry';
import { CHANNEL_RULES, NOTIFICATION_URGENCIES, policy } from '../../notification-policy';
import { ChannelResolutionService } from '../../pipeline/channel-resolution.service';

const { ALWAYS, DEFAULT, OPT_IN, FALLBACK, NEVER } = CHANNEL_RULES;

describe('NotificationPreferenceOptionsService', () => {
  const registry = new NotificationPolicyRegistry({
    [NotificationType.ROLE_CHANGED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.CRITICAL, {
      inApp: ALWAYS,
      sms: FALLBACK,
      whatsapp: NEVER,
    }),
    [NotificationType.SETTINGS_UPDATED]: policy(NotificationCategory.BILLING, NOTIFICATION_URGENCIES.INFORMATIONAL, {
      email: OPT_IN,
    }),
  });
  // Only defaultsForRole is used here; the rest of resolution needs Prisma.
  const resolution = {
    defaultsForRole: ChannelResolutionService.prototype.defaultsForRole,
  } as ChannelResolutionService;
  const service = new NotificationPreferenceOptionsService(registry, resolution);
  const billing = (role?: UserRole) =>
    service.list(role).categories.find((c) => c.category === NotificationCategory.BILLING)!;

  it('offers only categories some policy uses, platform categories first', () => {
    const keys = service.list(UserRole.OWNER).categories.map((c) => c.key);
    expect(keys).toEqual(['system', 'team', 'billing']);
  });

  it('reports the most permissive rule per channel and omits never', () => {
    expect(billing(UserRole.OWNER).channels).toEqual({ inApp: ALWAYS, push: DEFAULT, email: OPT_IN, sms: FALLBACK });
    expect(billing(UserRole.OWNER).channels).not.toHaveProperty('whatsapp');
  });

  it('defaults follow the role: staff start with SMS on, players off; optIn is off for everyone; always is on', () => {
    expect(billing(UserRole.OWNER).defaults).toEqual({ inApp: true, push: true, email: false, sms: true });
    expect(billing(UserRole.MEMBER).defaults).toEqual({ inApp: true, push: true, email: false, sms: false });
  });

  it('keys categories the way preferences are stored', () => {
    expect(service.list(UserRole.OWNER).categories.map((c) => c.key)).toEqual(
      service.list(UserRole.OWNER).categories.map((c) => c.category.toLowerCase()),
    );
  });

  it('computes once per role', () => {
    expect(service.list(UserRole.OWNER)).toBe(service.list(UserRole.OWNER));
    expect(service.list(UserRole.MEMBER)).not.toBe(service.list(UserRole.OWNER));
  });
});
