import { Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_TENANT_TIMEZONE } from '@app/shared-types';
import { type DeskScheduleState } from '../types';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { assertAutomaticSchedulesAvailable } from './scheduler-availability';

/**
 * Reads + writes the tenant-wide Desk schedule master switch
 * (`Tenant.deskScheduleEnabled`). When off (the default), the scheduler
 * heartbeat skips the whole tenant and nothing runs autonomously — a single
 * "pause all automatic runs" control. Manual "Run now" never consults it.
 *
 * Above it sits the platform switch (`DESK_SCHEDULER_ENABLED`, see
 * `scheduler-availability.ts`). While that is off, arming the master switch is
 * refused (409): the setting could not take effect. Pausing is always allowed.
 */
@Injectable()
export class DeskScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(tenantId: number): Promise<DeskScheduleState> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { deskScheduleEnabled: true, timezone: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      enabled: tenant.deskScheduleEnabled,
      // Read-only consumer of the tenant timezone — edited on the Organization
      // settings page. Falls back to the shared default when unset.
      timezone: tenant.timezone ?? DEFAULT_TENANT_TIMEZONE,
    };
  }

  async setState(tenantId: number, enabled: boolean): Promise<DeskScheduleState> {
    if (enabled) assertAutomaticSchedulesAvailable();
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { deskScheduleEnabled: enabled },
      select: { deskScheduleEnabled: true, timezone: true },
    });
    return {
      enabled: tenant.deskScheduleEnabled,
      timezone: tenant.timezone ?? DEFAULT_TENANT_TIMEZONE,
    };
  }
}
