import { Controller, Get, Post, Param, Query, Body, HttpStatus, HttpException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AlertStatsService } from './services/alert-stats.service';
import { AlertAnalyticsService } from './services/alert-analytics.service';
import { AlertTriggersService } from './services/alert-triggers.service';
import { AlertCacheService } from './services/alert-cache.service';
import { AlertBriefingService } from './services/alert-briefing.service';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole, AlertScope, AlertStatus, AlertPriority } from '@prisma/client';
import { AlertStatusSchema } from '@sally/shared-types';
import { DRIVER_ALERT_TYPES, LOAD_ALERT_TYPES } from './alert-scope.constants';
import { SnoozeAlertDto } from './dto/snooze-alert.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { ResolveAlertDto } from './dto/resolve-alert.dto';
import { BulkAcknowledgeDto, BulkResolveAlertsDto } from './dto/bulk-action.dto';

const ALERT_STATUS = AlertStatusSchema.enum;

// Phase 2 Task 10 — alert.driverId/loadId/routePlanId/vehicleId moved from
// business-ID strings to Int FKs. Read endpoints include the linked entities
// so `mapAlertResponse` can preserve the public string-identifier contract
// (driverId = Driver.driverId, loadId = Load.loadNumber, etc.) on the wire.
const ALERT_RESPONSE_INCLUDE = {
  driver: { select: { driverId: true } },
  load: { select: { loadNumber: true } },
  routePlan: { select: { planId: true } },
  vehicle: { select: { vehicleId: true } },
} as const;

@ApiTags('Alerts')
@Controller('alerts')
@RequireFeature('alerts')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class AlertsController {
  private readonly logger = new Logger(AlertsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertStatsService: AlertStatsService,
    private readonly analyticsService: AlertAnalyticsService,
    private readonly triggersService: AlertTriggersService,
    private readonly alertCache: AlertCacheService,
    private readonly briefingService: AlertBriefingService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all alerts (filterable by status, priority, driver, category)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    description: 'Filter by priority',
  })
  @ApiQuery({
    name: 'driverId',
    required: false,
    description: 'Filter by driver ID',
  })
  @ApiQuery({
    name: 'loadId',
    required: false,
    description: 'Filter by load ID',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    description: 'Filter by scope (load or fleet)',
  })
  async listAlerts(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('driverId') driverId?: string,
    @Query('loadId') loadId?: string,
    @Query('category') category?: string,
    @Query('scope') scope?: string,
  ) {
    this.logger.log(
      `List alerts requested: tenantId=${user.tenantDbId}, status=${status}, priority=${priority}, driver_id=${driverId}, load_id=${loadId}, category=${category}, scope=${scope}`,
    );

    try {
      const scopeEnum = scope
        ? (Object.values(AlertScope) as string[]).includes(scope.toUpperCase())
          ? (scope.toUpperCase() as AlertScope)
          : undefined
        : undefined;

      // status / priority arrive as free-form query strings — clients may send
      // any case (?status=active). Normalize to the Prisma enum before the
      // where clause; an unrecognized value is dropped rather than passed
      // through (a raw mismatch makes Prisma throw a 500).
      const statusEnum = status
        ? (Object.values(AlertStatus) as string[]).includes(status.toUpperCase())
          ? (status.toUpperCase() as AlertStatus)
          : undefined
        : undefined;
      const priorityEnum = priority
        ? (Object.values(AlertPriority) as string[]).includes(priority.toUpperCase())
          ? (priority.toUpperCase() as AlertPriority)
          : undefined
        : undefined;

      // Phase 2 Task 10 — query params still arrive as business slugs
      // (?driverId=TMS-DRV-001&loadId=LOAD-...); resolve to Int FKs at the
      // boundary before the where clause. A miss means no matching alerts.
      let driverDbId: number | null = null;
      if (driverId) {
        const d = await this.prisma.driver.findUnique({ where: { driverId }, select: { id: true } });
        if (!d) return [];
        driverDbId = d.id;
      }
      let loadDbId: number | null = null;
      if (loadId) {
        const l = await this.prisma.load.findUnique({
          where: { loadNumber_tenantId: { loadNumber: loadId, tenantId: user.tenantDbId } },
          select: { id: true },
        });
        if (!l) return [];
        loadDbId = l.id;
      }

      const where: any = {
        tenantId: user.tenantDbId,
        ...(statusEnum ? { status: statusEnum } : {}),
        ...(priorityEnum ? { priority: priorityEnum } : {}),
        ...(driverDbId !== null ? { driverId: driverDbId } : {}),
        ...(loadDbId !== null ? { loadId: loadDbId } : {}),
        ...(category ? { category } : {}),
        ...(scopeEnum ? { scope: scopeEnum } : {}),
      };

      // For load-scoped alerts, filter to alerts linked to in-transit loads
      if (scopeEnum === AlertScope.LOAD) {
        const activeLoads = await this.prisma.load.findMany({
          where: {
            tenantId: user.tenantDbId,
            status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
          },
          select: { id: true },
        });
        const activeLoadDbIds = activeLoads.map((l) => l.id);
        if (activeLoadDbIds.length === 0) return [];
        // Honor a more-specific loadDbId filter if both are present.
        where.loadId = loadDbId !== null ? loadDbId : { in: activeLoadDbIds };
      }

      const alerts = await this.prisma.alert.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: 500,
        include: ALERT_RESPONSE_INCLUDE,
      });

      return alerts.map((alert) => this.mapAlertResponse(alert));
    } catch (error) {
      this.logger.error(`List alerts failed: ${error.message}`);
      throw new HttpException({ detail: 'Failed to fetch alerts' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stats/smart')
  @ApiOperation({
    summary: 'Get smart alert statistics (drivers/loads with issues)',
  })
  async getSmartAlertStats(@CurrentUser() user: any) {
    return this.alertStatsService.getSmartStats(user.tenantDbId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get alert statistics for the current tenant' })
  async getAlertStats(@CurrentUser() user: any) {
    return this.alertStatsService.getStats(user.tenantDbId);
  }

  @Get('analytics/volume')
  @ApiOperation({ summary: 'Get alert volume by category and priority' })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Number of days (default 7)',
  })
  async getVolumeAnalytics(@CurrentUser() user: any, @Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 7;
    const [byCategory, byPriority] = await Promise.all([
      this.analyticsService.getVolumeByCategory(user.tenantDbId, d),
      this.analyticsService.getVolumeByPriority(user.tenantDbId, d),
    ]);
    return { byCategory, byPriority };
  }

  @Get('analytics/response-time')
  @ApiOperation({ summary: 'Get response time trend' })
  @ApiQuery({ name: 'days', required: false })
  async getResponseTimeTrend(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.analyticsService.getResponseTimeTrend(user.tenantDbId, days ? parseInt(days, 10) : 7);
  }

  @Get('analytics/resolution')
  @ApiOperation({ summary: 'Get resolution rates' })
  @ApiQuery({ name: 'days', required: false })
  async getResolutionRates(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.analyticsService.getResolutionRates(user.tenantDbId, days ? parseInt(days, 10) : 7);
  }

  @Get('analytics/top-types')
  @ApiOperation({ summary: 'Get top alert types' })
  @ApiQuery({ name: 'days', required: false })
  async getTopAlertTypes(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.analyticsService.getTopAlertTypes(user.tenantDbId, days ? parseInt(days, 10) : 7);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get alert history with filtering and pagination' })
  async getAlertHistory(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
  ) {
    return this.analyticsService.getAlertHistory(user.tenantDbId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      startDate,
      endDate,
      category,
      priority,
      status,
      driverId,
    });
  }

  @Get('grouped')
  @ApiOperation({ summary: 'Get alerts grouped by driver or load' })
  @ApiQuery({ name: 'scope', required: true, description: 'driver or load' })
  @ApiQuery({ name: 'priority', required: false })
  async listGroupedAlerts(
    @CurrentUser() user: any,
    @Query('scope') scope: 'driver' | 'load',
    @Query('priority') priority?: string,
  ) {
    try {
      const alertTypes = scope === 'driver' ? [...DRIVER_ALERT_TYPES] : [...LOAD_ALERT_TYPES];
      const where: any = {
        tenantId: user.tenantDbId,
        status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
        alertType: { in: alertTypes },
      };
      if (priority) where.priority = priority;

      const alerts = await this.prisma.alert.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: 500,
        // Phase 2 Task 10 — include the joined entities so the grouping
        // keys (driver.driverId slug, load.loadNumber) and the display
        // labels (driver.name, load.referenceNumber) are available without
        // a second roundtrip. Replaces the prior driverMap/loadMap lookup.
        include: {
          driver: { select: { driverId: true, name: true } },
          load: { select: { loadNumber: true, referenceNumber: true } },
          routePlan: { select: { planId: true } },
          vehicle: { select: { vehicleId: true } },
        },
      });

      // Group by the natural public business identifier for each scope.
      // Falls back to 'unknown' for alerts whose linked entity has been
      // deleted (alert.driverId / alert.loadId is NULL after ON DELETE
      // SET NULL fires).
      const groups = new Map<string, typeof alerts>();
      for (const alert of alerts) {
        const key = scope === 'driver' ? (alert.driver?.driverId ?? 'unknown') : (alert.load?.loadNumber ?? 'unknown');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(alert);
      }

      const result = Array.from(groups.entries()).map(([entityId, groupAlerts]) => {
        const latest = groupAlerts[0];
        const totalOccurrences = groupAlerts.reduce((sum, a) => sum + (a.occurrenceCount || 1), 0);
        return {
          entityId,
          scope,
          alertType: latest.alertType,
          category: latest.category,
          priority: latest.priority,
          driverId: latest.driver?.driverId ?? null,
          driverName: latest.driver?.name ?? undefined,
          loadId: latest.load?.loadNumber ?? null,
          loadNumber: latest.load?.loadNumber ?? undefined,
          referenceNumber: latest.load?.referenceNumber ?? undefined,
          latestAlert: this.mapAlertResponse(latest),
          alerts: groupAlerts.map((a) => this.mapAlertResponse(a)),
          occurrenceCount: totalOccurrences,
          alertCount: groupAlerts.length,
          firstOccurredAt: groupAlerts[groupAlerts.length - 1].createdAt,
        };
      });

      // Sort: highest priority first, then most alerts
      const priorityOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      result.sort((a, b) => {
        const pDiff = (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
        if (pDiff !== 0) return pDiff;
        return b.alertCount - a.alertCount;
      });

      return result;
    } catch (error) {
      this.logger.error(`List grouped alerts failed: ${error.message}`);
      throw new HttpException({ detail: 'Failed to fetch grouped alerts' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('briefing/cached')
  @ApiOperation({ summary: 'Get cached AI briefing (no LLM call)' })
  async getCachedBriefing(@CurrentUser() user: any) {
    return this.briefingService.getCached(user.tenantDbId);
  }

  @Post('briefing')
  @ApiOperation({ summary: 'Generate AI alert briefing' })
  async generateBriefing(@CurrentUser() user: any, @Query('force') force?: string) {
    return this.briefingService.generate(user.tenantDbId, force === 'true');
  }

  @Get(':alert_id')
  @ApiOperation({ summary: 'Get alert details by ID' })
  @ApiParam({ name: 'alert_id', description: 'Alert ID' })
  async getAlert(@Param('alert_id') alertId: string, @CurrentUser() user: any) {
    this.logger.log(`Get alert details: ${alertId}`);

    try {
      const alert = await this.prisma.alert.findFirst({
        where: { alertId, tenantId: user.tenantDbId },
        include: {
          ...ALERT_RESPONSE_INCLUDE,
          notes: { orderBy: { createdAt: 'asc' } },
          childAlerts: true,
        },
      });

      if (!alert) {
        throw new HttpException({ detail: `Alert ${alertId} not found` }, HttpStatus.NOT_FOUND);
      }

      return {
        ...this.mapAlertResponse(alert),
        notes: alert.notes.map((n) => ({
          noteId: n.noteId,
          authorName: n.authorName,
          content: n.content,
          createdAt: n.createdAt,
        })),
        childAlerts: alert.childAlerts.map((c) => ({
          alertId: c.alertId,
          alertType: c.alertType,
          priority: c.priority,
          title: c.title,
          status: c.status,
          createdAt: c.createdAt,
        })),
      };
    } catch (error) {
      this.logger.error(`Get alert failed: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: 'Failed to fetch alert' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':alert_id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiParam({ name: 'alert_id', description: 'Alert ID' })
  async acknowledgeAlert(@Param('alert_id') alertId: string, @CurrentUser() user: any) {
    this.logger.log(`Acknowledge alert: ${alertId} by ${user.userId}`);

    try {
      await this.assertTenantOwnership(alertId, user.tenantDbId);

      const alert = await this.prisma.alert.update({
        where: { alertId },
        data: {
          status: ALERT_STATUS.ACKNOWLEDGED,
          acknowledgedAt: new Date(),
          acknowledgedBy: user.userId,
        },
      });

      await this.alertCache.bustStatsCache(user.tenantDbId);

      return {
        alertId: alert.alertId,
        status: alert.status,
        acknowledgedAt: alert.acknowledgedAt,
        acknowledgedBy: alert.acknowledgedBy,
        message: 'Alert acknowledged successfully',
      };
    } catch (error) {
      this.logger.error(`Acknowledge alert failed: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: 'Failed to acknowledge alert' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':alert_id/resolve')
  @ApiOperation({ summary: 'Resolve an alert' })
  @ApiParam({ name: 'alert_id', description: 'Alert ID' })
  async resolveAlert(@Param('alert_id') alertId: string, @Body() dto: ResolveAlertDto, @CurrentUser() user: any) {
    this.logger.log(`Resolve alert: ${alertId}`);

    try {
      await this.assertTenantOwnership(alertId, user.tenantDbId);

      // Fetch cooldown hours from tenant settings
      const settings = await this.prisma.fleetOperationsSettings.findUnique({
        where: { tenantId: user.tenantDbId },
        select: { alertResolveCooldownHours: true },
      });
      const cooldownHours = settings?.alertResolveCooldownHours ?? 4;

      const alert = await this.prisma.alert.update({
        where: { alertId },
        data: {
          status: ALERT_STATUS.RESOLVED,
          resolvedAt: new Date(),
          resolvedBy: user.userId,
          resolutionNotes: dto.resolutionNotes,
          manualResolveCooldownUntil: new Date(Date.now() + cooldownHours * 3600000),
        },
      });

      await this.alertCache.bustStatsCache(user.tenantDbId);

      return {
        alertId: alert.alertId,
        status: alert.status,
        resolvedAt: alert.resolvedAt,
        resolutionNotes: alert.resolutionNotes,
        message: 'Alert resolved successfully',
      };
    } catch (error) {
      this.logger.error(`Resolve alert failed: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: 'Failed to resolve alert' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':alert_id/snooze')
  @ApiOperation({ summary: 'Snooze an alert for a specified duration' })
  @ApiParam({ name: 'alert_id', description: 'Alert ID' })
  async snoozeAlert(@Param('alert_id') alertId: string, @Body() dto: SnoozeAlertDto, @CurrentUser() user: any) {
    this.logger.log(`Snooze alert: ${alertId} for ${dto.durationMinutes} min`);

    await this.assertTenantOwnership(alertId, user.tenantDbId);

    const snoozedUntil = new Date(Date.now() + dto.durationMinutes * 60000);

    const alert = await this.prisma.alert.update({
      where: { alertId },
      data: {
        status: ALERT_STATUS.SNOOZED,
        snoozedUntil,
      },
    });

    await this.alertCache.bustStatsCache(user.tenantDbId);

    return {
      alertId: alert.alertId,
      status: alert.status,
      snoozedUntil,
      message: `Alert snoozed until ${snoozedUntil.toISOString()}`,
    };
  }

  @Post(':alert_id/notes')
  @ApiOperation({ summary: 'Add a note to an alert' })
  @ApiParam({ name: 'alert_id', description: 'Alert ID' })
  async addNote(@Param('alert_id') alertId: string, @Body() dto: AddNoteDto, @CurrentUser() user: any) {
    this.logger.log(`Add note to alert: ${alertId}`);

    // Single tenant-scoped lookup that doubles as the ownership check and the
    // slug → Int resolution for the FK write (Phase 2 Task 3 — AlertNote.alertId
    // is now an Int FK to Alert.id).
    const alert = await this.prisma.alert.findFirst({
      where: { alertId, tenantId: user.tenantDbId },
      select: { id: true },
    });
    if (!alert) {
      throw new HttpException({ detail: `Alert ${alertId} not found` }, HttpStatus.NOT_FOUND);
    }

    const note = await this.prisma.alertNote.create({
      data: {
        alertId: alert.id,
        authorId: user.userId,
        authorName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        content: dto.content,
      },
    });

    return {
      noteId: note.noteId,
      // Public response continues to identify the alert by its slug, not the
      // internal Int FK. Frontends already key on this value.
      alertId,
      authorName: note.authorName,
      content: note.content,
      createdAt: note.createdAt,
    };
  }

  @Post('bulk/acknowledge')
  @ApiOperation({ summary: 'Acknowledge multiple alerts at once' })
  async bulkAcknowledge(@Body() dto: BulkAcknowledgeDto, @CurrentUser() user: any) {
    this.logger.log(`Bulk acknowledge: ${dto.alertIds.length} alerts`);

    const result = await this.prisma.alert.updateMany({
      where: { alertId: { in: dto.alertIds }, tenantId: user.tenantDbId },
      data: {
        status: ALERT_STATUS.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy: user.userId,
      },
    });

    await this.alertCache.bustStatsCache(user.tenantDbId);

    return {
      updated: result.count,
      message: `${result.count} alerts acknowledged`,
    };
  }

  @Post('bulk/resolve')
  @ApiOperation({ summary: 'Resolve multiple alerts at once' })
  async bulkResolve(@Body() dto: BulkResolveAlertsDto, @CurrentUser() user: any) {
    this.logger.log(`Bulk resolve: ${dto.alertIds.length} alerts`);

    // Fetch cooldown and set on each alert
    const settings = await this.prisma.fleetOperationsSettings.findUnique({
      where: { tenantId: user.tenantDbId },
      select: { alertResolveCooldownHours: true },
    });
    const cooldownHours = settings?.alertResolveCooldownHours ?? 4;

    const result = await this.prisma.alert.updateMany({
      where: { alertId: { in: dto.alertIds }, tenantId: user.tenantDbId },
      data: {
        status: ALERT_STATUS.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: user.userId,
        resolutionNotes: dto.resolutionNotes,
        manualResolveCooldownUntil: new Date(Date.now() + cooldownHours * 3600000),
      },
    });

    await this.alertCache.bustStatsCache(user.tenantDbId);

    return {
      updated: result.count,
      message: `${result.count} alerts resolved`,
    };
  }

  private mapAlertResponse(alert: any) {
    return {
      alertId: alert.alertId,
      // Phase 2 Task 10 — the wire keeps the public business-ID strings
      // (driver.driverId slug, load.loadNumber, route_plan.planId,
      // vehicle.vehicleId) so the dispatcher UI and AI tools see no change.
      // The new Int FKs are internal only; read paths include() the four
      // relations so the strings are always available.
      driverId: alert.driver?.driverId ?? null,
      loadId: alert.load?.loadNumber ?? null,
      scope: alert.scope,
      routePlanId: alert.routePlan?.planId ?? null,
      vehicleId: alert.vehicle?.vehicleId ?? null,
      alertType: alert.alertType,
      category: alert.category,
      priority: alert.priority,
      title: alert.title,
      message: alert.message,
      recommendedAction: alert.recommendedAction,
      metadata: alert.metadata,
      status: alert.status,
      acknowledgedAt: alert.acknowledgedAt,
      acknowledgedBy: alert.acknowledgedBy,
      snoozedUntil: alert.snoozedUntil,
      resolvedAt: alert.resolvedAt,
      resolvedBy: alert.resolvedBy,
      resolutionNotes: alert.resolutionNotes,
      autoResolved: alert.autoResolved,
      escalationLevel: alert.escalationLevel,
      parentAlertId: alert.parentAlertId,
      occurrenceCount: alert.occurrenceCount ?? 1,
      lastOccurredAt: alert.lastOccurredAt,
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
    };
  }

  private async assertTenantOwnership(alertId: string, tenantId: number) {
    const alert = await this.prisma.alert.findFirst({
      where: { alertId, tenantId },
      select: { alertId: true },
    });
    if (!alert) {
      throw new HttpException({ detail: `Alert ${alertId} not found` }, HttpStatus.NOT_FOUND);
    }
  }
}
