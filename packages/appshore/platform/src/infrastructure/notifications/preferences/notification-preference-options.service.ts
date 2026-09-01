import { Injectable } from '@nestjs/common';
import { DeliveryChannel, NotificationCategory, type UserRole } from '@appshore/db';
import type { NotificationPreferenceOptions } from '@app/shared-types';
import { NotificationPolicyRegistry } from '../notification-policy.registry';
import { CHANNEL_PREF_KEYS, CHANNEL_RULES, type ChannelRule } from '../notification-policy';
import { ChannelResolutionService } from '../pipeline/channel-resolution.service';

@Injectable()
export class NotificationPreferenceOptionsService {
  private readonly byRole = new Map<string, NotificationPreferenceOptions>();

  constructor(
    private readonly policies: NotificationPolicyRegistry,
    private readonly resolution: ChannelResolutionService,
  ) {}

  /** Computed once per role — the registry is fixed at boot. Enum order keeps the platform categories first. */
  list(role: UserRole | string | undefined): NotificationPreferenceOptions {
    const key = String(role ?? '');
    let options = this.byRole.get(key);
    if (!options) {
      const roleDefaults = this.resolution.defaultsForRole(role);
      options = {
        categories: Object.values(NotificationCategory)
          .map((category) => ({ category, offered: this.policies.offeredChannels(category) }))
          .filter(({ offered }) => Object.keys(offered).length > 0)
          .map(({ category, offered }) => {
            const entries = Object.entries(offered) as [DeliveryChannel, ChannelRule][];
            return {
              key: category.toLowerCase(),
              category,
              channels: Object.fromEntries(entries.map(([channel, rule]) => [CHANNEL_PREF_KEYS[channel], rule])),
              defaults: Object.fromEntries(
                entries.map(([channel, rule]) => [
                  CHANNEL_PREF_KEYS[channel],
                  rule === CHANNEL_RULES.ALWAYS ||
                    (rule !== CHANNEL_RULES.OPT_IN && roleDefaults[CHANNEL_PREF_KEYS[channel]]),
                ]),
              ),
            };
          }),
      };
      this.byRole.set(key, options);
    }
    return options;
  }
}
