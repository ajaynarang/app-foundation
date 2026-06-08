import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { MonitoringEngineService } from './monitoring-engine.service';

@Injectable()
export class LoadMonitoringService {
  private readonly logger = new Logger(LoadMonitoringService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: MonitoringEngineService,
  ) {}

  async monitorActiveLoads() {
    if (this.isRunning) {
      this.logger.warn('Previous monitoring cycle still running, skipping');
      return;
    }

    this.isRunning = true;
    try {
      // Find tenants with active loads assigned to drivers
      const tenants = await this.prisma.load.groupBy({
        by: ['tenantId'],
        where: {
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
          driverId: { not: null },
        },
      });

      if (tenants.length === 0) {
        return;
      }

      this.logger.log(`Starting monitoring cycle for ${tenants.length} tenant(s)`);

      // Run monitoring cycle per tenant sequentially to avoid overloading
      for (const { tenantId } of tenants) {
        try {
          await this.engine.runCycleForTenant(tenantId);
        } catch (err) {
          this.logger.error(`Monitoring cycle failed for tenant ${tenantId}: ${err}`);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
