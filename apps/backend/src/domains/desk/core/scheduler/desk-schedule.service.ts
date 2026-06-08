import { Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_TENANT_TIMEZONE, type DeskScheduleState } from '@sally/shared-types';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/**
 * Reads + writes the tenant-wide Desk schedule master switch
 * (`Tenant.deskScheduleEnabled`). When off (the default), the scheduler
 * heartbeat skips the whole tenant and nothing runs autonomously — a single
 * "pause all automatic runs" control. Manual "Run now" never consults it.
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
