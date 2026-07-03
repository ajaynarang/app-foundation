import { Global, Module, Injectable } from '@nestjs/common';
import {
  USER_LIFECYCLE_HOOKS,
  TENANT_PROVISION_HOOKS,
  type UserLifecycleHooks,
  type TenantProvisionHooks,
} from '@appshore/platform/domains/platform/platform-hooks';
import { NotificationTriggersService } from '../domains/notifications/notification-triggers.service';
import { InAppNotificationsModule } from '../domains/notifications/notifications.module';
import { DeskBootstrapService } from '../domains/desk/responsibilities/desk-bootstrap.service';
import { DeskResponsibilityModule } from '../domains/desk/responsibilities/desk-responsibility.module';

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

@Injectable()
class DeskTenantProvisionHooks implements TenantProvisionHooks {
  constructor(private readonly deskBootstrap: DeskBootstrapService) {}
  tenantApproved(tenantDbId: number) {
    return this.deskBootstrap.bootstrapForTenant(tenantDbId);
  }
}

@Global()
@Module({
  imports: [InAppNotificationsModule, DeskResponsibilityModule],
  providers: [
    NotificationUserLifecycleHooks,
    DeskTenantProvisionHooks,
    { provide: USER_LIFECYCLE_HOOKS, useExisting: NotificationUserLifecycleHooks },
    { provide: TENANT_PROVISION_HOOKS, useExisting: DeskTenantProvisionHooks },
  ],
  exports: [USER_LIFECYCLE_HOOKS, TENANT_PROVISION_HOOKS],
})
export class PlatformHooksModule {}
