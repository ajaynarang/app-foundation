import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DeliveryChannel, UserRole, type NotificationType } from '@appshore/db';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_PLATFORM_TIMEZONE, PLATFORM_TIMEZONE } from '../../../config/platform-timezone';
import { WhatsAppConsentService } from '../channels/whatsapp/whatsapp-consent.service';
import { WhatsAppTemplateRegistry } from '../channels/whatsapp/whatsapp-template.registry';
import { DELIVERY_SKIP_REASONS, type DeliverySkipReason } from './delivery-outcome';
import {
  CHANNEL_PREF_KEYS,
  CHANNEL_RULES,
  NOTIFICATION_URGENCIES,
  type ChannelPrefKey,
  type ChannelRule,
  type NotificationPolicy,
} from '../notification-policy';
import { NotificationPolicyRegistry } from '../notification-policy.registry';

/** Zero-padded 24h clock. Quiet-hours bounds are compared as strings, so "9:00" would sort above "22:00". */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Delivery order. In-app first: it is the durable record the others point back to. */
const CHANNEL_ORDER: readonly DeliveryChannel[] = [
  DeliveryChannel.IN_APP,
  DeliveryChannel.EMAIL,
  DeliveryChannel.PUSH,
  DeliveryChannel.SMS,
  DeliveryChannel.WHATSAPP,
];

/** Quiet hours stop a phone buzzing at 2am; they never throw the notification away. */
const INTERRUPTIVE = new Set<DeliveryChannel>([DeliveryChannel.PUSH, DeliveryChannel.SMS, DeliveryChannel.WHATSAPP]);

export interface ResolvedChannels {
  /** Attempt now, in this order. */
  primary: DeliveryChannel[];
  /** Attempt only if no primary channel reached the recipient. */
  fallback: DeliveryChannel[];
  /** Why a channel is absent — a SKIPPED ledger row, so the console can explain the gap. */
  suppressed: Partial<Record<DeliveryChannel, DeliverySkipReason>>;
  suppressedByQuietHours: boolean;
}

export type ChannelDefaults = Record<ChannelPrefKey, boolean>;
type StoredChannelPrefs = Partial<Record<ChannelPrefKey, boolean>>;

/**
 * Channel defaults when the user has expressed no preference for that channel.
 * They sit UNDER the type's policy: a policy `never` cannot be defaulted on, and a
 * policy `optIn` needs an explicit stored yes regardless of the role.
 *
 * MEMBERs are players: they live in the mobile app and have no route to the web
 * settings page, so whatever lands here is what they get for good. Staff
 * (OWNER/ADMIN) can reach settings and turn off what they don't want.
 */
const PLAYER_CHANNEL_DEFAULTS: ChannelDefaults = { inApp: true, push: true, email: false, sms: false, whatsapp: true };
const STAFF_CHANNEL_DEFAULTS: ChannelDefaults = { inApp: true, push: true, email: true, sms: true, whatsapp: true };

@Injectable()
export class ChannelResolutionService {
  private readonly logger = new Logger(ChannelResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappConsent: WhatsAppConsentService,
    private readonly policies: NotificationPolicyRegistry,
    private readonly templates: WhatsAppTemplateRegistry,
    @Optional() @Inject(PLATFORM_TIMEZONE) private readonly platformTimezone: string = DEFAULT_PLATFORM_TIMEZONE,
  ) {}

  async resolveForNotification(params: {
    userId: number;
    /** Scopes the role lookup. A user is staff in their own club and a plain player in someone else's. */
    tenantId: number;
    type: NotificationType;
  }): Promise<ResolvedChannels> {
    const policy = this.policies.get(params.type);
    const [userPrefs, defaults, consented] = await Promise.all([
      this.prisma.userPreferences.findUnique({ where: { userId: params.userId } }),
      this.resolveDefaults(params.userId, params.tenantId),
      this.whatsappConsent.consentedUserIds([params.userId], this.templates.consentKind(params.type)),
    ]);

    return this.resolveChannels(policy, userPrefs, defaults, consented.has(params.userId));
  }

  /**
   * Resolve for a whole audience in two queries instead of two per recipient.
   * A draw published to a 200-entrant category ran the single-user path inside a
   * serial loop — 400 round trips before the first message left.
   */
  async resolveForAudience(params: {
    userIds: number[];
    tenantId: number;
    type: NotificationType;
  }): Promise<Map<number, ResolvedChannels>> {
    const resolved = new Map<number, ResolvedChannels>();
    if (params.userIds.length === 0) return resolved;

    const policy = this.policies.get(params.type);
    const [allPrefs, consented, memberships] = await Promise.all([
      this.prisma.userPreferences.findMany({ where: { userId: { in: params.userIds } } }),
      this.whatsappConsent.consentedUserIds(params.userIds, this.templates.consentKind(params.type)),
      this.prisma.workspaceMember
        .findMany({
          where: { userId: { in: params.userIds }, tenantId: params.tenantId },
          select: { userId: true, role: true },
        })
        .catch((err: any) => {
          this.logger.warn(`Could not resolve roles for tenant ${params.tenantId}: ${err.message}`);
          return [] as { userId: number; role: string }[];
        }),
    ]);

    const prefsByUser = new Map(allPrefs.map((p) => [p.userId, p] as const));
    const roleByUser = new Map(memberships.map((m) => [m.userId, m.role] as const));

    for (const userId of params.userIds) {
      // Absent membership falls open to staff defaults, exactly as the single-user path does.
      const defaults = roleByUser.get(userId) === UserRole.MEMBER ? PLAYER_CHANNEL_DEFAULTS : STAFF_CHANNEL_DEFAULTS;
      resolved.set(
        userId,
        this.resolveChannels(policy, prefsByUser.get(userId) ?? null, defaults, consented.has(userId)),
      );
    }

    return resolved;
  }

  /** The channel defaults a role starts from — what a settings toggle shows before the user has chosen. */
  defaultsForRole(role: UserRole | string | undefined): ChannelDefaults {
    return role === UserRole.MEMBER ? PLAYER_CHANNEL_DEFAULTS : STAFF_CHANNEL_DEFAULTS;
  }

  /**
   * Policy first, then the user, then the moment. Each layer only narrows:
   * `never` beats a stored yes; `always` beats a stored no; quiet hours hold
   * back the interruptive channels unless the type is critical; consent is law.
   */
  private resolveChannels(
    policy: NotificationPolicy,
    userPrefs: any,
    defaults: ChannelDefaults,
    whatsappConsented: boolean,
  ): ResolvedChannels {
    const stored: StoredChannelPrefs | undefined = userPrefs?.notificationPreferences?.[policy.category.toLowerCase()];
    const inQuietHours = userPrefs ? this.isInQuietHours(userPrefs) : false;
    const piercesQuietHours = policy.urgency === NOTIFICATION_URGENCIES.CRITICAL;

    const result: ResolvedChannels = {
      primary: [],
      fallback: [],
      suppressed: {},
      suppressedByQuietHours: inQuietHours,
    };

    for (const channel of CHANNEL_ORDER) {
      const rule = policy.channels[channel];
      const reason = this.suppressionReason(
        rule,
        channel,
        stored,
        defaults,
        whatsappConsented,
        inQuietHours && !piercesQuietHours,
      );
      if (reason) {
        result.suppressed[channel] = reason;
      } else {
        (rule === CHANNEL_RULES.FALLBACK ? result.fallback : result.primary).push(channel);
      }
    }
    return result;
  }

  private suppressionReason(
    rule: ChannelRule,
    channel: DeliveryChannel,
    stored: StoredChannelPrefs | undefined,
    defaults: ChannelDefaults,
    whatsappConsented: boolean,
    quiet: boolean,
  ): DeliverySkipReason | null {
    if (rule === CHANNEL_RULES.NEVER) return DELIVERY_SKIP_REASONS.POLICY_NEVER;
    if (rule !== CHANNEL_RULES.ALWAYS) {
      const key = CHANNEL_PREF_KEYS[channel];
      const enabled = rule === CHANNEL_RULES.OPT_IN ? stored?.[key] === true : (stored?.[key] ?? defaults[key]);
      if (!enabled) return DELIVERY_SKIP_REASONS.USER_OPT_OUT;
    }
    if (channel === DeliveryChannel.WHATSAPP && !whatsappConsented) return DELIVERY_SKIP_REASONS.NO_CONSENT;
    if (quiet && INTERRUPTIVE.has(channel)) return DELIVERY_SKIP_REASONS.QUIET_HOURS;
    return null;
  }

  /**
   * Fails open to staff defaults. A missing membership row means we cannot prove
   * this user is a player, and silently dropping someone to in-app-only on the
   * strength of a failed lookup is the worse error: they would never learn their
   * match had moved.
   */
  private async resolveDefaults(userId: number, tenantId: number): Promise<ChannelDefaults> {
    try {
      const membership = await this.prisma.workspaceMember.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        select: { role: true },
      });
      return membership?.role === UserRole.MEMBER ? PLAYER_CHANNEL_DEFAULTS : STAFF_CHANNEL_DEFAULTS;
    } catch (err: any) {
      this.logger.warn(`Could not resolve role for user ${userId} in tenant ${tenantId}: ${err.message}`);
      return STAFF_CHANNEL_DEFAULTS;
    }
  }

  private isInQuietHours(prefs: any): boolean {
    if (!prefs?.quietHoursEnabled || !prefs?.quietHoursStart || !prefs?.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const tz = prefs.timezone || this.platformTimezone;
    // hourCycle 'h23', NOT hour12:false — the latter renders midnight as "24:00"
    // through "24:59", so a 00:00–07:00 quiet window never matched at 00:30
    // ("24:30" < "07:00" is false) and the phone buzzed anyway. These are
    // lexicographic string compares; the hour must be 00-23, zero-padded.
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: tz,
    });
    const currentTime = formatter.format(now);

    const start = prefs.quietHoursStart;
    const end = prefs.quietHoursEnd;

    // A malformed bound would compare lexicographically against a well-formed
    // clock and could suppress push/SMS around the clock, silently and forever.
    if (!HH_MM.test(start) || !HH_MM.test(end)) {
      this.logger.warn(`Ignoring malformed quiet hours for user prefs: "${start}"–"${end}" (want HH:MM)`);
      return false;
    }

    // Overnight window (e.g. 22:00 - 06:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }
    return currentTime >= start && currentTime < end;
  }
}
