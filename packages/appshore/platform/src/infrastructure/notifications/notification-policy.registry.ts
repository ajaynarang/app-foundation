import { Inject, Injectable, InternalServerErrorException, Logger, Optional } from '@nestjs/common';
import { DeliveryChannel, type NotificationCategory } from '@appshore/db';
import { NotificationTypeSchema, PLATFORM_NOTIFICATION_TYPES, type NotificationType } from '@app/shared-types';
import {
  CHANNEL_RULES,
  NOTIFICATION_POLICIES,
  NOTIFICATION_TYPES,
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
  private readonly declared: readonly NotificationType[];

  /**
   * Refuses to boot on a gap: every declared type (the platform's and the app's NOTIFICATION_TYPES) has exactly one
   * policy, every policy names a declared type, and no type is declared twice. Held by
   * `__tests__/notification-policy.registry.spec.ts` and the app's `notification-policy-parity.spec.ts`.
   */
  constructor(
    @Optional() @Inject(NOTIFICATION_POLICIES) appPolicies: NotificationPolicyMap = {},
    @Optional() @Inject(NOTIFICATION_TYPES) appTypes: readonly string[] = [],
  ) {
    this.policies = merge(PLATFORM_NOTIFICATION_POLICIES, appPolicies);
    this.declared = declaredTypes(appTypes);
    assertPolicyParity(this.declared, this.policies);
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

  /** Every declared type: the platform's, then the app's. Each has a policy (checked at boot). */
  types(): NotificationType[] {
    return [...this.declared];
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

const WHERE =
  "declare app types in platform-glue/notifications/notification-types.ts and bind each one's policy to NOTIFICATION_POLICIES (platform-glue/hooks.module.ts)";

function declaredTypes(appTypes: readonly string[]): NotificationType[] {
  const seen = new Set<string>(PLATFORM_NOTIFICATION_TYPES);
  for (const type of appTypes) {
    if (!NotificationTypeSchema.safeParse(type).success) {
      throw new Error(`Notification type ${type} is not a valid notification type (SCREAMING_SNAKE, at most 60 chars)`);
    }
    if (seen.has(type)) throw new Error(`Notification type ${type} is declared twice; ${WHERE}.`);
    seen.add(type);
  }
  return [...seen];
}

function assertPolicyParity(declared: readonly string[], policies: NotificationPolicyMap): void {
  const known = new Set(declared);
  const missing = declared.filter((type) => !policies[type]);
  if (missing.length) {
    throw new Error(`Notification type ${missing.join(', ')} has no policy; ${WHERE}.`);
  }
  const undeclared = Object.keys(policies).filter((type) => !known.has(type));
  if (undeclared.length) {
    throw new Error(`A policy for ${undeclared.join(', ')} names a type that is not declared; ${WHERE}.`);
  }
}

/** The app's map wins: an app may re-declare a platform type to change how it behaves for its users. */
function merge(platform: NotificationPolicyMap, app: NotificationPolicyMap): NotificationPolicyMap {
  return { ...platform, ...app };
}
