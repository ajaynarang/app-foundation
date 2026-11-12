import { Injectable } from '@nestjs/common';
import { UserRole } from '@appshore/db';
import { PlatformNotificationType, type NotificationType } from '@app/shared-types';
import { NotificationDispatcherService } from '@appshore/platform/infrastructure/notifications/pipeline/notification-dispatcher.service';
import { RecipientResolutionService } from '@appshore/platform/infrastructure/notifications/pipeline/recipient-resolution.service';
import type { DispatchRecipient } from '@appshore/platform/infrastructure/notifications/pipeline/dispatch.types';
import { AI_SETTINGS_WEB_PATH, INTEGRATIONS_WEB_PATH } from '../../shared/web-routes';

interface TriggerParams {
  tenantId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  iconType?: string;
  metadata?: Record<string, any>;
  recipientRoles?: UserRole[];
  recipientUserIds?: number[];
}

const STAFF: UserRole[] = [UserRole.OWNER, UserRole.ADMIN];

/** How a workspace AI credential type reads in a notification. */
const AI_CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  ANTHROPIC_KEY: 'Anthropic',
  OPENROUTER_KEY: 'OpenRouter',
  VERCEL_GATEWAY_KEY: 'Vercel AI Gateway',
  BEDROCK_ROLE: 'AWS Bedrock',
};

/**
 * This app's notification vocabulary: one named method per thing that happens.
 * Which channels carry each type, and to whom, is the platform's job — see
 * NOTIFICATION_POLICIES in platform-glue/hooks.module.ts. Add your product's
 * triggers here, following the four below.
 */
@Injectable()
export class NotificationTriggersService {
  constructor(
    private readonly recipients: RecipientResolutionService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  async trigger(params: TriggerParams): Promise<void> {
    const { recipientRoles, recipientUserIds, ...message } = params;
    const recipients: DispatchRecipient[] = recipientUserIds?.length
      ? await this.recipients.resolveByUserIds(params.tenantId, recipientUserIds, { scopeToMembership: true })
      : await this.recipients.resolveByRoles(params.tenantId, recipientRoles ?? []);
    await this.dispatcher.dispatch({ ...message, recipients });
  }

  async userJoined(tenantId: number, userName: string, role: string) {
    return this.trigger({
      tenantId,
      type: PlatformNotificationType.USER_JOINED,
      title: `${userName} Joined`,
      message: `New ${role.toLowerCase()} added to the team`,
      iconType: 'user',
      recipientRoles: STAFF,
    });
  }

  /** The person whose role changed hears it, and so does every admin. */
  async userRoleChanged(tenantId: number, userId: number, userName: string, oldRole: string, newRole: string) {
    const admins = await this.recipients.resolveByRoles(tenantId, STAFF);
    return this.trigger({
      tenantId,
      type: PlatformNotificationType.ROLE_CHANGED,
      title: `Role Changed — ${userName}`,
      message: `Changed from ${oldRole} to ${newRole}`,
      iconType: 'user',
      recipientUserIds: [...new Set([userId, ...admins.map((a) => a.id)])],
    });
  }

  async integrationSyncCompleted(tenantId: number, integrationName: string, summary: string) {
    return this.trigger({
      tenantId,
      type: PlatformNotificationType.INTEGRATION_SYNC_COMPLETED,
      title: `${integrationName} Sync Complete`,
      message: summary,
      actionUrl: INTEGRATIONS_WEB_PATH,
      actionLabel: 'Open Settings',
      iconType: 'integration',
      recipientRoles: STAFF,
    });
  }

  /**
   * The workspace's platform-paid AI spend hit its hard cap, so AI calls the platform pays for are paused. Sent at
   * most once a day per workspace (`AiBudgetNudgeListener`).
   */
  async aiBudgetReached(tenantId: number) {
    return this.trigger({
      tenantId,
      type: PlatformNotificationType.AI_BUDGET_REACHED,
      title: 'AI usage limit reached',
      message:
        'This workspace reached its AI usage limit, so AI features are paused until the limit resets. An administrator can raise it.',
      iconType: 'ai',
      recipientRoles: STAFF,
    });
  }

  /**
   * A workspace's own AI key needs attention. `failed-test`: it failed its test (on connect, "Test again" or the daily
   * sweep), is now FAILING, and the AI calls it served are blocked until it passes again or is removed. `credit-refused`:
   * the provider refused a call for credit; the key stays ACTIVE and the owner tops it up. Sent to owners and admins;
   * the credit case at most once a day per key. Never names more of the key than its last four characters.
   */
  async aiCredentialFailing(
    tenantId: number,
    credential: { type: string; lastFour: string | null },
    cause: 'failed-test' | 'credit-refused',
  ) {
    const which = `${AI_CREDENTIAL_TYPE_LABELS[credential.type] ?? credential.type} key${
      credential.lastFour ? ` ending ${credential.lastFour}` : ''
    }`;
    return this.trigger({
      tenantId,
      type: PlatformNotificationType.AI_CREDENTIAL_FAILING,
      title: cause === 'failed-test' ? 'AI key is failing' : 'AI key is out of credit',
      message:
        cause === 'failed-test'
          ? `The workspace's ${which} failed its check, so the AI features it pays for are paused. Test it again or replace it in AI settings.`
          : `The provider refused a call on the workspace's ${which} because its credit can't cover it. Add credit or raise the key's limit.`,
      actionUrl: AI_SETTINGS_WEB_PATH,
      actionLabel: 'Open AI settings',
      iconType: 'ai',
      recipientRoles: STAFF,
    });
  }

  async integrationSyncFailed(tenantId: number, integrationName: string, error: string) {
    return this.trigger({
      tenantId,
      type: PlatformNotificationType.INTEGRATION_SYNC_FAILED,
      title: `${integrationName} Sync Failed`,
      message: error,
      actionUrl: INTEGRATIONS_WEB_PATH,
      actionLabel: 'Open Settings',
      iconType: 'integration',
      recipientRoles: STAFF,
    });
  }
}
