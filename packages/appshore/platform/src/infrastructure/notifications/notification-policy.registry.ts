import { Inject, Injectable, InternalServerErrorException, Logger, Optional } from '@nestjs/common';
import { DeliveryChannel, type NotificationCategory, type NotificationType } from '@appshore/db';
import {
  CHANNEL_RULES,
  NOTIFICATION_POLICIES,
  NOTIFICATION_URGENCIES,
  type ChannelRule,
  type NotificationPolicy,
  type NotificationPolicyMap,
} from './notification-policy';
import { PLATFORM_NOTIFICATION_POLICIES } from './platform-notification-policies';

/** Ordered by what happens when the user has not chosen — the rule a settings toggle should show. */
const RULE_PRECEDENCE: readonly ChannelRule[] = [
  CHANNEL_RULES.ALWAYS,
  CHANNEL_RULES.DEFAULT,
  CHANNEL_RULES.FALLBACK,
  CHANNEL_RULES.OPT_IN,
];

@Injectable()
export class NotificationPolicyRegistry {
  private readonly logger = new Logger(NotificationPolicyRegistry.name);
  private readonly policies: NotificationPolicyMap;

  constructor(@Optional() @Inject(NOTIFICATION_POLICIES) appPolicies: NotificationPolicyMap = {}) {
    this.policies = merge(PLATFORM_NOTIFICATION_POLICIES, appPolicies);
  }

  get(type: NotificationType): NotificationPolicy {
    const found = this.policies[type];
    if (!found) {
      // Reachable from an HTTP-triggered send only if the parity spec was skipped; keep the toast generic.
      this.logger.error(`No notification policy declared for ${type}`);
      throw new InternalServerErrorException('This notification could not be routed');
    }
    return found;
  }

  categoryOf(type: NotificationType): NotificationCategory {
    return this.get(type).category;
  }

  isCritical(type: NotificationType): boolean {
    return this.get(type).urgency === NOTIFICATION_URGENCIES.CRITICAL;
  }

  types(): NotificationType[] {
    return Object.keys(this.policies) as NotificationType[];
  }

  /**
   * Per channel, the most permissive rule any type in the category declares; `never` is not offered.
   * A category toggle answers "may this channel be used", so it shows what CAN happen with no
   * choice made — an optIn type in the same category still needs the user's yes at send time.
   */
  offeredChannels(category: NotificationCategory): Partial<Record<DeliveryChannel, ChannelRule>> {
    const offered: Partial<Record<DeliveryChannel, ChannelRule>> = {};
    for (const type of this.types()) {
      const declared = this.get(type);
      if (declared.category !== category) continue;
      for (const channel of Object.values(DeliveryChannel)) {
        const rule = declared.channels[channel];
        if (rule === CHANNEL_RULES.NEVER) continue;
        const current = offered[channel];
        if (!current || RULE_PRECEDENCE.indexOf(rule) < RULE_PRECEDENCE.indexOf(current)) {
          offered[channel] = rule;
        }
      }
    }
    return offered;
  }
}

/** The app's map wins: an app may re-declare a platform type to change how it behaves for its users. */
function merge(platform: NotificationPolicyMap, app: NotificationPolicyMap): NotificationPolicyMap {
  return { ...platform, ...app };
}
