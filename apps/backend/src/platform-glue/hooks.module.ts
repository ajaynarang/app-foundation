import { Global, Module, Injectable } from '@nestjs/common';
import {
  USER_LIFECYCLE_HOOKS,
  TENANT_PROVISION_HOOKS,
  type UserLifecycleHooks,
} from '@appshore/platform/domains/platform-hooks';
import {
  NOTIFICATION_POLICIES,
  NOTIFICATION_TYPES,
} from '@appshore/platform/infrastructure/notifications/notification-policy';
import { WHATSAPP_TEMPLATES } from '@appshore/platform/infrastructure/notifications/channels/whatsapp/whatsapp-template.registry';
import { NotificationTriggersService } from '../domains/notifications/notification-triggers.service';
import { InAppNotificationsModule } from '../domains/notifications/notifications.module';
import { APP_NOTIFICATION_TYPES } from './notifications/notification-types';
import { APP_NOTIFICATION_POLICIES, APP_WHATSAPP_TEMPLATES } from './notifications/app-notification-policies';
import { OPTIONAL_FEATURES } from './features';
import { featureHookImports, featureHookProviders } from './features/feature-hooks';

/**
 * Binds the platform package's optional hooks to this app's implementations.
 * The @appshore/platform services stay app-blind; this is the ONLY place that
 * connects platform lifecycle moments to app domains.
 */
@Injectable()
class NotificationUserLifecycleHooks implements UserLifecycleHooks {
  constructor(private readonly triggers: NotificationTriggersService) {}
  userJoined(tenantDbId: number, userName: string, role: string) {
    return this.triggers.userJoined(tenantDbId, userName, role);
  }
  userRoleChanged(tenantDbId: number, userId: number, userName: string, oldRole: string, newRole: string) {
    return this.triggers.userRoleChanged(tenantDbId, userId, userName, oldRole, newRole);
  }
}

@Global()
@Module({
  imports: [InAppNotificationsModule, ...featureHookImports(OPTIONAL_FEATURES)],
  providers: [
    NotificationUserLifecycleHooks,
    { provide: USER_LIFECYCLE_HOOKS, useExisting: NotificationUserLifecycleHooks },
    // Each optional feature's tenant-provision hook (platform-glue/features), behind one composite; a no-op when
    // the product kept none.
    ...featureHookProviders(OPTIONAL_FEATURES),
    // Your notification types (notifications/notification-types.ts) and their policies (category, urgency, channel
    // rules; app-notification-policies.ts). The platform's own types are already covered. The policy registry refuses
    // to boot when a declared type has no policy.
    { provide: NOTIFICATION_TYPES, useValue: APP_NOTIFICATION_TYPES },
    { provide: NOTIFICATION_POLICIES, useValue: APP_NOTIFICATION_POLICIES },
    // Your Meta-approved WhatsApp templates, keyed by notification type. Empty = no type sends on WhatsApp.
    { provide: WHATSAPP_TEMPLATES, useValue: APP_WHATSAPP_TEMPLATES },
    // Bind PLATFORM_TIMEZONE (from @appshore/platform/config/platform-timezone) to run wall-clock
    // derivations in a zone other than UTC.
  ],
  exports: [
    USER_LIFECYCLE_HOOKS,
    TENANT_PROVISION_HOOKS,
    NOTIFICATION_TYPES,
    NOTIFICATION_POLICIES,
    WHATSAPP_TEMPLATES,
  ],
})
export class PlatformHooksModule {}
