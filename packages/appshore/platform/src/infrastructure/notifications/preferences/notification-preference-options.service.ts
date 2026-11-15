import { Injectable } from '@nestjs/common';
import { DeliveryChannel, NotificationCategory } from '@appshore/db';
import type { NotificationPreferenceOptions } from '@app/shared-types';
import { NotificationPolicyRegistry } from '../notification-policy.registry';
import { CHANNEL_PREF_KEYS, CHANNEL_RULES, type ChannelRule } from '../notification-policy';
import { CHANNEL_DEFAULTS } from '../pipeline/channel-resolution.service';

@Injectable()
export class NotificationPreferenceOptionsService {
  private options?: NotificationPreferenceOptions;

  constructor(private readonly policies: NotificationPolicyRegistry) {}

  /** Computed once — the registry is fixed at boot. Enum order keeps the platform categories first. */
  list(): NotificationPreferenceOptions {
    this.options ??= {
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
                  (rule !== CHANNEL_RULES.OPT_IN && CHANNEL_DEFAULTS[CHANNEL_PREF_KEYS[channel]]),
              ]),
            ),
          };
        }),
    };
    return this.options;
  }
}
