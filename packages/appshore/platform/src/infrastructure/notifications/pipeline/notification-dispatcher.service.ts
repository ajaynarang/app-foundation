import { Injectable, Logger } from '@nestjs/common';
import { DeliveryChannel, type NotificationCategory } from '@appshore/db';
import { FEATURE_KEYS } from '@app/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { PlansService } from '../../../domains/plans/plans.service';
import { FeatureFlagsService } from '../../../domains/feature-flags/feature-flags.service';
import { NotificationPolicyRegistry } from '../notification-policy.registry';
import { ChannelResolutionService, type ResolvedChannels } from './channel-resolution.service';
import { NotificationDeliveryService, type DeliveryReport, type PendingWhatsAppSend } from './delivery.service';
import { DeliveryLedgerService, type RecipientOutcomes } from './delivery-ledger.service';
import { skipped } from './delivery-outcome';
import { WhatsAppDispatchService } from '../channels/whatsapp/whatsapp-dispatch.service';
import { WHATSAPP_FEATURE_FLAG } from '../channels/whatsapp/whatsapp.constants';
import type { DispatchParams, DispatchRecipient } from './dispatch.types';

/**
 * One notification to many recipients: resolve the tenant and the WhatsApp gates
 * once, resolve every recipient's channels in two queries, deliver, write the
 * ledger, then enqueue the WhatsApp sends whose ledger rows now exist.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelResolution: ChannelResolutionService,
    private readonly deliveryService: NotificationDeliveryService,
    private readonly plansService: PlansService,
    private readonly ledger: DeliveryLedgerService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly whatsappDispatch: WhatsAppDispatchService,
    private readonly policies: NotificationPolicyRegistry,
  ) {}

  /**
   * The tenant's public string id (push payload) and its name (every WhatsApp
   * template closes with it). Never throws: a failed lookup ships the push
   * without the club tag and the template with a neutral club name.
   */
  private async resolveTenant(tenantDbId: number): Promise<{ slug?: string; name: string }> {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantDbId },
        select: { tenantId: true, companyName: true },
      });
      return { slug: tenant?.tenantId, name: tenant?.companyName || 'Your club' };
    } catch (err: any) {
      this.logger.warn(`Could not resolve tenant for delivery: ${err.message}`);
      return { name: 'Your club' };
    }
  }

  /** The club's plan, read once per trigger. No slug or a failed lookup is "no" — never fail open here. */
  private async isWhatsAppEntitled(tenantSlug: string | undefined): Promise<boolean> {
    if (!tenantSlug) return false;
    try {
      const plan = await this.plansService.getTenantPlan(tenantSlug);
      return await this.plansService.isFeatureEnabled(plan, FEATURE_KEYS.WHATSAPP_NOTIFICATIONS);
    } catch (err: any) {
      this.logger.warn(`Could not read the WhatsApp entitlement for ${tenantSlug}: ${err.message}`);
      return false;
    }
  }

  /** The platform kill switch, read once per trigger. A lookup failure is "off". */
  private async isWhatsAppEnabled(): Promise<boolean> {
    try {
      return await this.featureFlags.isEnabled(WHATSAPP_FEATURE_FLAG);
    } catch (err: any) {
      this.logger.warn(`Could not read ${WHATSAPP_FEATURE_FLAG}: ${err.message}`);
      return false;
    }
  }

  async dispatch(params: DispatchParams): Promise<void> {
    let attempted = 0;
    let failed = 0;
    try {
      const { recipients } = params;

      // Resolved ONCE per dispatch, not per recipient: a draw published to a
      // 64-player category must not be a 64-query fan-out for values that cannot
      // change between iterations. Both fail open — losing the club tag on a push
      // is a far better outcome than losing the notification.
      const [tenant, whatsappEnabled] = await Promise.all([
        this.resolveTenant(params.tenantId),
        this.isWhatsAppEnabled(),
      ]);
      const whatsappEntitled = whatsappEnabled ? await this.isWhatsAppEntitled(tenant.slug) : false;

      // Two queries for the whole audience. A resolution failure loses the WHOLE
      // audience, so it is a total failure: let it propagate to the sweep's
      // claim-release rather than degrading to "nobody to notify".
      const channelsByUser = await this.channelResolution.resolveForAudience({
        userIds: recipients.map((r) => r.id),
        tenantId: params.tenantId,
        type: params.type,
      });
      const context: DispatchContext = {
        params,
        tenant,
        whatsappEnabled,
        whatsappEntitled,
        category: this.policies.categoryOf(params.type),
      };

      const ledgerRows: RecipientOutcomes[] = [];
      const pendingSends: PendingWhatsAppSend[] = [];
      for (const recipient of recipients) {
        try {
          const channels = channelsByUser.get(recipient.id);
          if (!channels) continue;

          // Nothing to attempt, but the WHY still goes to the ledger: a player who
          // opted out of everything shows up in the console as opted out, not as
          // a notification that never existed.
          if (channels.primary.length === 0 && channels.fallback.length === 0) {
            ledgerRows.push({ userId: recipient.id, outcomes: suppressedOutcomes(channels) });
            continue;
          }
          attempted += 1;

          const delivered = await this.deliverToRecipient(recipient, channels, context);
          ledgerRows.push({ userId: recipient.id, outcomes: delivered.outcomes });
          pendingSends.push(...delivered.pendingSends);
          if (!delivered.reached) {
            failed += 1;
            this.logger.warn(`Nothing reached user ${recipient.id} on ${params.type}`);
          }
        } catch (err: any) {
          failed += 1;
          this.logger.warn(`Failed to notify user ${recipient.id}: ${err.message}`);
        }
      }

      await this.ledger.recordOutcomes({ tenantId: params.tenantId, type: params.type, recipients: ledgerRows });
      // The job id is the ledger id, so the rows must exist before the queue does.
      if (pendingSends.length > 0) {
        await this.whatsappDispatch.enqueue(pendingSends, { tenantId: params.tenantId, type: params.type });
      }
    } catch (err: any) {
      this.logger.error(`Failed to dispatch notification ${params.type}: ${err.message}`);
      throw err;
    }

    // Reminder sweeps claim a sent-marker, call the dispatcher, and release the
    // claim in catch(). Swallowing a total outage consumes that claim, so the
    // reminder is lost rather than retried. A partial failure must NOT throw:
    // one dead FCM token cannot fail a 200-player draw.
    if (attempted > 0 && failed === attempted) {
      throw new Error(`Notification ${params.type} failed for every recipient (${failed})`);
    }
  }

  /**
   * deliver() catches per channel and never throws, so its RESULT is the only
   * evidence anything landed: a recipient whose every channel came back false
   * was not notified, however calmly the call returned. An EMPTY result counts
   * too — email and SMS write no key when there is no address.
   */
  private async deliverToRecipient(
    recipient: DispatchRecipient,
    channels: ResolvedChannels,
    { params, tenant, whatsappEnabled, whatsappEntitled, category }: DispatchContext,
  ): Promise<DeliveryReport & { reached: boolean }> {
    // User.userId is what the SSE registry and the JWT key on; without it the in-app row still lands.
    if (!recipient.userId) {
      this.logger.warn(`User ${recipient.id} has no userId — skipping SSE for this notification`);
    }
    const addresses = [...channels.primary, ...channels.fallback];
    const report = await this.deliveryService.deliver({
      recipientUserId: recipient.userId || undefined,
      recipientDbId: recipient.id,
      tenantId: params.tenantId,
      tenantSlug: tenant.slug,
      clubName: tenant.name,
      whatsappEnabled,
      whatsappEntitled,
      type: params.type,
      category,
      // A recipient may carry its own copy of the message (a guardian reading a child's).
      title: recipient.title ?? params.title,
      message: params.message,
      actionUrl: params.actionUrl,
      actionLabel: params.actionLabel,
      iconType: params.iconType,
      metadata: recipient.metadata ?? params.metadata,
      groupScope: params.groupScope,
      channels,
      // Hand over an address only for a channel we are actually sending on, so the two can never disagree.
      recipientEmail: addresses.includes(DeliveryChannel.EMAIL) ? (recipient.email ?? undefined) : undefined,
      recipientPhone:
        addresses.includes(DeliveryChannel.SMS) || addresses.includes(DeliveryChannel.WHATSAPP)
          ? (recipient.phone ?? undefined)
          : undefined,
    });
    return { ...report, reached: Object.values(report.results).some(Boolean) };
  }
}

interface DispatchContext {
  params: DispatchParams;
  tenant: { slug?: string; name: string };
  whatsappEnabled: boolean;
  whatsappEntitled: boolean;
  category: NotificationCategory;
}

const suppressedOutcomes = (channels: ResolvedChannels) =>
  Object.entries(channels.suppressed).map(([channel, reason]) => skipped(channel as DeliveryChannel, reason));
