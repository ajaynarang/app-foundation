import { Injectable, Logger } from '@nestjs/common';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { EmailService } from '../../../../infrastructure/notification/services/email.service';
import { TimezoneService } from '../../../../shared/services/timezone.service';
import { TenantJobRunService } from '../../../../shared/services/tenant-job-run.service';
import { DIGEST_LOCAL_HOUR, TENANT_JOB_KEYS } from '../../../../shared/constants/scheduling.constants';
import { AlertAnalyticsService } from './alert-analytics.service';

const ALERT_STATUS = AlertStatusSchema.enum;

@Injectable()
export class AlertDigestService {
  private readonly logger = new Logger(AlertDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly analyticsService: AlertAnalyticsService,
    private readonly timezoneService: TimezoneService,
    private readonly tenantJobRun: TenantJobRunService,
  ) {}

  async generateDailyDigest() {
    this.logger.log('Generating daily alert digests...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, companyName: true },
    });

    const now = new Date();
    for (const tenant of tenants) {
      try {
        // Fire only at the tenant-local digest hour, once per local day.
        const tz = await this.timezoneService.resolveTenantTimezone(tenant.id);
        if (this.timezoneService.localHour(tz, now) !== DIGEST_LOCAL_HOUR) continue;
        const localToday = this.timezoneService.localDate(tz, now);
        if (await this.tenantJobRun.hasRunOn(tenant.id, TENANT_JOB_KEYS.ALERT_DIGEST, localToday)) continue;

        const dispatchers = await this.prisma.user.findMany({
          where: {
            tenantId: tenant.id,
            role: { in: ['DISPATCHER', 'ADMIN', 'OWNER'] },
            isActive: true,
          },
          select: { email: true, firstName: true },
        });

        if (dispatchers.length === 0) continue;

        const [unresolvedCount, stats, volumeByCategory] = await Promise.all([
          this.prisma.alert.count({
            where: {
              tenantId: tenant.id,
              status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
            },
          }),
          this.analyticsService.getResolutionRates(tenant.id, 1),
          this.analyticsService.getVolumeByCategory(tenant.id, 1),
        ]);

        const categoryList = volumeByCategory.map((v) => `${v.category}: ${v.count}`).join(', ');

        for (const dispatcher of dispatchers) {
          await this.emailService.sendEmail({
            to: dispatcher.email,
            subject: `[SALLY] Daily Alert Digest — ${tenant.companyName}`,
            html: `
              <h2>Daily Alert Digest</h2>
              <p>Hi ${dispatcher.firstName || 'Dispatcher'},</p>
              <p>Here's your alert summary for the last 24 hours:</p>
              <ul>
                <li><strong>New alerts:</strong> ${stats.total}</li>
                <li><strong>Resolved:</strong> ${stats.resolved} (${stats.resolutionRate}%)</li>
                <li><strong>Auto-resolved:</strong> ${stats.autoResolved}</li>
                <li><strong>Escalated:</strong> ${stats.escalated} (${stats.escalationRate}%)</li>
                <li><strong>Currently unresolved:</strong> ${unresolvedCount}</li>
              </ul>
              ${categoryList ? `<p><strong>By category:</strong> ${categoryList}</p>` : ''}
              <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/dispatcher/tower">View Tower</a></p>
            `,
            text: `Daily Alert Digest — New: ${stats.total}, Resolved: ${stats.resolved}, Unresolved: ${unresolvedCount}`,
          });
        }

        this.logger.log(`Sent daily digest for tenant ${tenant.companyName} to ${dispatchers.length} users`);

        // Idempotency stamp — record tenant-local date so hourly wake-ups fire once/day.
        await this.tenantJobRun.markRanOn(tenant.id, TENANT_JOB_KEYS.ALERT_DIGEST, localToday);
      } catch (error: any) {
        this.logger.error(`Failed to generate digest for tenant ${tenant.id}: ${error.message}`);
      }
    }
  }

  async generateShiftSummary() {
    this.logger.log('Generating shift summary emails...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, companyName: true },
    });

    for (const tenant of tenants) {
      try {
        const dispatchers = await this.prisma.user.findMany({
          where: {
            tenantId: tenant.id,
            role: { in: ['DISPATCHER', 'ADMIN', 'OWNER'] },
            isActive: true,
          },
          select: { email: true, firstName: true },
        });

        if (dispatchers.length === 0) continue;

        const unresolvedAlerts = await this.prisma.alert.findMany({
          where: {
            tenantId: tenant.id,
            status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED, ALERT_STATUS.SNOOZED] },
          },
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          take: 20,
        });

        if (unresolvedAlerts.length === 0) continue;

        const alertList = unresolvedAlerts
          .map((a) => `<li>[${a.priority.toUpperCase()}] ${a.title} — ${a.status} (Driver: ${a.driverId})</li>`)
          .join('');

        for (const dispatcher of dispatchers) {
          await this.emailService.sendEmail({
            to: dispatcher.email,
            subject: `[SALLY] Shift Handoff — ${unresolvedAlerts.length} Unresolved Alerts`,
            html: `
              <h2>Shift Handoff Summary</h2>
              <p>Hi ${dispatcher.firstName || 'Dispatcher'},</p>
              <p>The following <strong>${unresolvedAlerts.length}</strong> alerts need attention:</p>
              <ol>${alertList}</ol>
              <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/dispatcher/tower">View Tower</a></p>
            `,
            text: `Shift Handoff: ${unresolvedAlerts.length} unresolved alerts require attention.`,
          });
        }
      } catch (error: any) {
        this.logger.error(`Failed to generate shift summary for tenant ${tenant.id}: ${error.message}`);
      }
    }
  }
}
