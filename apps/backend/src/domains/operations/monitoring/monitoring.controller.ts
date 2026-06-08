import { Controller, Get, Post, Param, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { RoutePlanStatus, RouteSegmentStatus, UserRole } from '@prisma/client';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TenantDbId } from '../../../auth/decorators/tenant-db-id.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { IntegrationDataService } from '../../integrations/services/integration-data.service';
import { RouteEventService } from './services/route-event.service';
import { DriverEventService } from './services/driver-event.service';
import { MonitoringEngineService } from './services/monitoring-engine.service';
import {
  StartRouteSchema,
  PickupCompleteSchema,
  DeliveryCompleteSchema,
  DispatcherOverrideSchema,
} from './dto/driver-event.dto';

const ALERT_STATUS = AlertStatusSchema.enum;

@Controller('api/v1/routes')
@RequireFeature('continuous_monitoring')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class MonitoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationManager: IntegrationDataService,
    private readonly routeEventService: RouteEventService,
    private readonly driverEventService: DriverEventService,
    private readonly monitoringEngine: MonitoringEngineService,
  ) {}

  @Get(':planId/monitoring')
  async getMonitoringStatus(@Param('planId') planId: string, @TenantDbId() tenantId: number) {
    const plan = await this.prisma.routePlan.findFirst({
      where: { planId, tenantId },
      include: {
        segments: { orderBy: { sequenceOrder: 'asc' } },
        driver: true,
        vehicle: true,
        events: { orderBy: { occurredAt: 'desc' }, take: 10 },
      },
    });

    if (!plan) throw new NotFoundException(`Route plan ${planId} not found`);

    const currentSegment =
      plan.segments.find((s: any) => s.status === RouteSegmentStatus.IN_PROGRESS) ??
      plan.segments.find((s: any) => s.status === RouteSegmentStatus.PLANNED) ??
      null;

    const completedSegments = plan.segments.filter((s: any) => s.status === RouteSegmentStatus.COMPLETED).length;

    // Phase 2 Task 10 — alert.routePlanId is now the Int FK to route_plans.id.
    // plan.id is already in scope from the findFirst above.
    const activeAlerts = await this.prisma.alert.count({
      where: { routePlanId: plan.id, tenantId, status: ALERT_STATUS.ACTIVE },
    });

    let hosState = null;
    const hosData = await this.integrationManager.getDriverHOS(tenantId, plan.driver.driverId);
    if (hosData) {
      hosState = {
        currentDutyStatus: hosData.currentDutyStatus ?? 'unknown',
        driveTimeRemainingMinutes: Math.round((hosData.driveTimeRemainingMs ?? 0) / 60000),
        shiftTimeRemainingMinutes: Math.round((hosData.shiftTimeRemainingMs ?? 0) / 60000),
        cycleTimeRemainingMinutes: Math.round((hosData.cycleTimeRemainingMs ?? 0) / 60000),
        timeUntilBreakMinutes: Math.round((hosData.timeUntilBreakMs ?? 0) / 60000),
      };
    }

    let driverPosition = null;
    const gps = await this.integrationManager.getVehicleLocation(tenantId, plan.vehicle.vehicleId);
    if (gps) {
      driverPosition = {
        lat: gps.latitude,
        lon: gps.longitude,
        speed: gps.speed,
        heading: gps.heading,
        lastUpdated: gps.timestamp,
      };
    }

    const etaDeviation = this.calculateEtaDeviation(plan, currentSegment);

    return {
      planId: plan.planId,
      currentSegment: currentSegment
        ? {
            segmentId: (currentSegment as any).segmentId,
            sequenceOrder: (currentSegment as any).sequenceOrder,
            segmentType: (currentSegment as any).segmentType,
            status: (currentSegment as any).status,
          }
        : null,
      driverPosition,
      hosState,
      etaDeviation,
      completedSegments,
      totalSegments: plan.segments.length,
      activeAlerts,
      lastChecked: new Date().toISOString(),
      recentEvents: plan.events,
    };
  }

  @Get(':planId/updates')
  async getUpdates(@Param('planId') planId: string, @TenantDbId() tenantId: number) {
    const plan = await this.prisma.routePlan.findFirst({
      where: { planId, tenantId },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException(`Route plan ${planId} not found`);

    return this.prisma.routeEvent.findMany({
      where: { planId: plan.id },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });
  }

  private async getActivePlan(planId: string, tenantId: number) {
    const plan = await this.prisma.routePlan.findFirst({
      where: { planId, tenantId },
      include: {
        segments: { orderBy: { sequenceOrder: 'asc' } },
        driver: true,
        vehicle: true,
        loads: { include: { load: true } },
      },
    });
    if (!plan) throw new BadRequestException(`Route plan ${planId} not found`);
    if (plan.status !== RoutePlanStatus.ACTIVE)
      throw new BadRequestException(`Route plan ${planId} is not active (status: ${plan.status})`);
    return plan;
  }

  @Post(':planId/events/start-route')
  async startRoute(@Param('planId') planId: string, @Body() body: any, @TenantDbId() tenantId: number) {
    const dto = StartRouteSchema.parse(body);
    const plan = await this.getActivePlan(planId, tenantId);
    return this.driverEventService.handleStartRoute(plan, dto, tenantId);
  }

  @Post(':planId/events/pickup-complete')
  async pickupComplete(@Param('planId') planId: string, @Body() body: any, @TenantDbId() tenantId: number) {
    const dto = PickupCompleteSchema.parse(body);
    const plan = await this.getActivePlan(planId, tenantId);
    return this.driverEventService.handlePickupComplete(plan, dto as any, tenantId);
  }

  @Post(':planId/events/delivery-complete')
  async deliveryComplete(@Param('planId') planId: string, @Body() body: any, @TenantDbId() tenantId: number) {
    const dto = DeliveryCompleteSchema.parse(body);
    const plan = await this.getActivePlan(planId, tenantId);
    return this.driverEventService.handleDeliveryComplete(plan, dto as any, tenantId);
  }

  @Post(':planId/events/dispatcher-override')
  async dispatcherOverride(
    @Param('planId') planId: string,
    @Body() body: any,
    @TenantDbId() tenantId: number,
    @CurrentUser() user: any,
  ) {
    const dto = DispatcherOverrideSchema.parse(body);
    const plan = await this.getActivePlan(planId, tenantId);
    return this.driverEventService.handleDispatcherOverride(plan, dto as any, tenantId, user.userId);
  }

  private calculateEtaDeviation(
    plan: any,
    currentSegment: any,
  ): { minutes: number; status: 'on_time' | 'at_risk' | 'late' } {
    if (!plan.estimatedArrival || !currentSegment) {
      return { minutes: 0, status: 'on_time' };
    }
    const now = Date.now();
    const eta = new Date(currentSegment.estimatedArrival).getTime();
    const diff = Math.round((now - eta) / 60000);

    if (diff < 0) return { minutes: 0, status: 'on_time' };
    if (diff < 30) return { minutes: diff, status: 'at_risk' };
    return { minutes: diff, status: 'late' };
  }
}
