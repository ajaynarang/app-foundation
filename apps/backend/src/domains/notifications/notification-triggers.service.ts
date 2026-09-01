import { Injectable } from '@nestjs/common';
import { NotificationType, UserRole } from '@appshore/db';
import { NotificationDispatcherService } from '@appshore/platform/infrastructure/notifications/pipeline/notification-dispatcher.service';
import { RecipientResolutionService } from '@appshore/platform/infrastructure/notifications/pipeline/recipient-resolution.service';
import type { DispatchRecipient } from '@appshore/platform/infrastructure/notifications/pipeline/dispatch.types';

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
      type: NotificationType.USER_JOINED,
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
      type: NotificationType.ROLE_CHANGED,
      title: `Role Changed — ${userName}`,
      message: `Changed from ${oldRole} to ${newRole}`,
      iconType: 'user',
      recipientUserIds: [...new Set([userId, ...admins.map((a) => a.id)])],
    });
  }

  async integrationSyncCompleted(tenantId: number, integrationName: string, summary: string) {
    return this.trigger({
      tenantId,
      type: NotificationType.INTEGRATION_SYNC_COMPLETED,
      title: `${integrationName} Sync Complete`,
      message: summary,
      actionUrl: 'console:/integrations/connections',
      actionLabel: 'View Integrations',
      iconType: 'integration',
      recipientRoles: STAFF,
    });
  }

  async integrationSyncFailed(tenantId: number, integrationName: string, error: string) {
    return this.trigger({
      tenantId,
      type: NotificationType.INTEGRATION_SYNC_FAILED,
      title: `${integrationName} Sync Failed`,
      message: error,
      actionUrl: 'console:/integrations/connections',
      actionLabel: 'View Integrations',
      iconType: 'integration',
      recipientRoles: STAFF,
    });
  }
}
