import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { OUTBOUND_CHANNEL, type OutboundChannel } from '@appshore/kernel/infrastructure/outbound/outbound-channel';
import {
  OUTBOUND_ALLOWLIST_BOOTSTRAP_ENV,
  OUTBOUND_MODE,
  OUTBOUND_MODE_ENV,
  resolveOutboundMode,
  type OutboundMode,
} from '@appshore/kernel/infrastructure/outbound/outbound-mode';
import {
  STAGING_EMAIL_SUBJECT_PREFIX,
  STAGING_PUSH_TITLE_PREFIX,
  STAGING_SMS_PREFIX,
  type EmailEnvelope,
  type OutboundContext,
  type OutboundGate,
  type OutboundTarget,
} from '@appshore/kernel/infrastructure/outbound/outbound-gate.port';
import {
  type AllowEntryValue,
  type AllowSet,
  buildAllowSet,
  isEmailAllowed,
  isPhoneAllowed,
  isUrlAllowed,
  maskEmail,
  maskPhone,
  maskUrl,
  mergeAllowSets,
  parseBootstrapAllowList,
  redactPreview,
} from '@appshore/kernel/infrastructure/outbound/outbound-recipient';

const ALLOW_SET_TTL_MS = 30_000;
const RECIPIENT_MAX = 255;
const SUBJECT_MAX = 200;
const SOURCE_MAX = 80;

/**
 * The outbound gate (ADR "Outbound gate"), bound to the kernel's `OUTBOUND_GATE` port by the global `OutboundModule`.
 *
 * In `live` mode every method is a pass-through: no database read, no change to the message. In `allowlist` mode
 * only recipients on the allow-list (the `outbound_allow_entries` table merged with `OUTBOUND_ALLOWLIST_BOOTSTRAP`)
 * get through, each one held back is recorded in `outbound_suppressions` (masked), and whatever is sent is marked as
 * staging. An unreadable table fails closed: only the bootstrap entries pass.
 */
@Injectable()
export class OutboundPolicyService implements OutboundGate {
  private readonly logger = new Logger(OutboundPolicyService.name);
  private readonly mode: OutboundMode;
  private readonly bootstrap: AllowSet;
  private readonly bootstrapEntries: readonly AllowEntryValue[];
  private cached: { allow: AllowSet; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.mode = resolveOutboundMode({
      ENV_TYPE: config.get<string>('ENV_TYPE'),
      [OUTBOUND_MODE_ENV]: config.get<string>(OUTBOUND_MODE_ENV),
    });
    this.bootstrapEntries = parseBootstrapAllowList(config.get<string>(OUTBOUND_ALLOWLIST_BOOTSTRAP_ENV));
    this.bootstrap = buildAllowSet(this.bootstrapEntries);
    if (this.mode === OUTBOUND_MODE.ALLOWLIST) {
      this.logger.warn(
        `Outbound gate is in allowlist mode: only allow-listed recipients are messaged (${this.bootstrapEntries.length} bootstrap entries)`,
      );
    }
  }

  getMode(): OutboundMode {
    return this.mode;
  }

  isLive(): boolean {
    return this.mode === OUTBOUND_MODE.LIVE;
  }

  /** How many entries `OUTBOUND_ALLOWLIST_BOOTSTRAP` adds, for the admin page. The values stay in the environment. */
  bootstrapCount(): number {
    return this.bootstrapEntries.length;
  }

  /** Drops the cached allow-list so the next send re-reads it (after an admin edit). */
  invalidate(): void {
    this.cached = null;
  }

  async gateEmail<T extends EmailEnvelope>(message: T, context: OutboundContext): Promise<T | null> {
    if (this.isLive()) return message;

    const allow = await this.getAllowSet();
    const toList = Array.isArray(message.to) ? message.to : [message.to];
    const allowed = (list: readonly string[]) => list.filter((address) => isEmailAllowed(address, allow));
    const allowedTo = allowed(toList);
    const heldBack = [...toList, ...(message.cc ?? []), ...(message.bcc ?? [])].filter(
      (address) => !isEmailAllowed(address, allow),
    );

    const recordContext = { ...context, subject: context.subject ?? message.subject };
    for (const address of heldBack) {
      await this.record(OUTBOUND_CHANNEL.EMAIL, maskEmail(address), recordContext);
    }

    if (allowedTo.length === 0) return null;

    return {
      ...message,
      to: Array.isArray(message.to) ? allowedTo : allowedTo[0],
      ...(message.cc ? { cc: allowed(message.cc) } : {}),
      ...(message.bcc ? { bcc: allowed(message.bcc) } : {}),
      subject: `${STAGING_EMAIL_SUBJECT_PREFIX}${message.subject}`,
    };
  }

  async allowPhone(phone: string, context: OutboundContext): Promise<boolean> {
    if (this.isLive()) return true;
    if (isPhoneAllowed(phone, await this.getAllowSet())) return true;
    await this.record(OUTBOUND_CHANNEL.SMS, maskPhone(phone), context);
    return false;
  }

  async allowUser(userId: number, context: OutboundContext): Promise<boolean> {
    if (this.isLive()) return true;
    const user = await this.findContact(userId);
    if (user && this.userAllowed(user, await this.getAllowSet())) return true;
    await this.record(OUTBOUND_CHANNEL.PUSH, user?.email ? maskEmail(user.email) : 'unknown user', context);
    return false;
  }

  async allowUrl(url: string, context: OutboundContext): Promise<boolean> {
    if (this.isLive()) return true;
    if (isUrlAllowed(url, await this.getAllowSet())) return true;
    await this.record(OUTBOUND_CHANNEL.WEBHOOK, maskUrl(url), context);
    return false;
  }

  async wouldAllow(target: OutboundTarget): Promise<boolean> {
    if (this.isLive()) return true;
    const allow = await this.getAllowSet();
    switch (target.channel) {
      case 'email':
        return isEmailAllowed(target.address, allow);
      case 'sms':
      case 'whatsapp':
        return isPhoneAllowed(target.phone, allow);
      case 'push': {
        const user = await this.findContact(target.userId);
        return !!user && this.userAllowed(user, allow);
      }
      case 'webhook':
        return isUrlAllowed(target.url, allow);
    }
  }

  markSms(text: string): string {
    return this.isLive() ? text : `${STAGING_SMS_PREFIX}${text}`;
  }

  markPushTitle(title: string): string {
    return this.isLive() ? title : `${STAGING_PUSH_TITLE_PREFIX}${title}`;
  }

  private findContact(userId: number) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
  }

  private userAllowed(user: { email: string | null; phone: string | null }, allow: AllowSet): boolean {
    return (!!user.email && isEmailAllowed(user.email, allow)) || (!!user.phone && isPhoneAllowed(user.phone, allow));
  }

  /** Fails closed: an unreadable table leaves only the bootstrap entries. Cached for 30 seconds. */
  private async getAllowSet(): Promise<AllowSet> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.allow;
    try {
      const entries = await this.prisma.outboundAllowEntry.findMany({ select: { kind: true, value: true } });
      const allow = mergeAllowSets(buildAllowSet(entries), this.bootstrap);
      this.cached = { allow, expiresAt: Date.now() + ALLOW_SET_TTL_MS };
      return allow;
    } catch (error) {
      this.logger.error(
        `Outbound allow-list unreadable, only bootstrap entries pass: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      return this.bootstrap;
    }
  }

  /** Never throws: the send is held back whether or not the row lands. The recipient arrives masked. */
  private async record(channel: OutboundChannel, maskedRecipient: string, context: OutboundContext): Promise<void> {
    this.logger.log(`Held back ${channel} to ${maskedRecipient} (${context.source})`);
    try {
      await this.prisma.outboundSuppression.create({
        data: {
          id: generateUuidV7(),
          channel,
          recipient: maskedRecipient.slice(0, RECIPIENT_MAX),
          subject: context.subject ? redactPreview(context.subject).slice(0, SUBJECT_MAX) : null,
          source: context.source.slice(0, SOURCE_MAX),
          tenantId: context.tenantId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not record a held-back ${channel} send: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }
  }
}
