import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ZodError } from 'zod';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { RoutePlanStatus, RouteSegmentStatus, UserRole } from '@prisma/client';
import { RoutePlanningEngineService, RoutePlanRequest } from '../services/route-planning-engine.service';
import { RoutePlanPersistenceService } from '../services/route-plan-persistence.service';
import { RoutePlanFeedbackService } from '../services/route-plan-feedback.service';
import { GeoJSONService } from '../services/geojson.service';
import { GeocodingService } from '../../../platform-services/geocoding/geocoding.service';
import { CreateRoutePlanSchema, CreateRoutePlanDto } from '../dto/create-route-plan.dto';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';

class GeocodeStopsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  loadIds: string[];
}

const SEGMENT_STATUS_VALUES = Object.values(RouteSegmentStatus);

/**
 * RoutePlanningController handles HTTP requests for route planning operations.
 * Provides endpoints for planning, activating, and managing route plans.
 */
@ApiTags('Routes')
@ApiBearerAuth()
@Controller('routes')
@RequireFeature('route_planning')
export class RoutePlanningController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly routePlanningEngine: RoutePlanningEngineService,
    private readonly persistenceService: RoutePlanPersistenceService,
    private readonly feedbackService: RoutePlanFeedbackService,
    private readonly geojsonService: GeoJSONService,
    private readonly geocodingService: GeocodingService,
  ) {
    super(prisma);
  }

  /**
   * Plan a new route.
   * POST /routes/plan
   */
  @Post('plan')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Plan a new route for one or more loads' })
  async planRoute(@Body() body: any, @CurrentUser() user: any) {
    // Validate request body with Zod
    let dto: CreateRoutePlanDto;
    try {
      dto = CreateRoutePlanSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.issues,
        });
      }
      throw error;
    }

    // Get tenant database ID
    const tenantId = await this.getTenantDbId(user);

    // Build request for the engine
    const request: RoutePlanRequest = {
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      loadIds: dto.loadIds,
      departureTime: new Date(dto.departureTime),
      tenantId,
      optimizationPriority: dto.optimizationPriority,
      includePricing: (dto as any).includePricing,
      startFromCurrentLocation: (dto as any).startFromCurrentLocation,
      excludeCompletedStops: (dto as any).excludeCompletedStops,
      estimatedDieselPrice: (dto as any).estimatedDieselPrice,
      // Cast needed: Zod v3 infers nested object properties as optional in z.infer
      dispatcherParams: dto.dispatcherParams as RoutePlanRequest['dispatcherParams'],
    };

    // Check for driver unavailability overlapping planned route (warn, don't block)
    const routeResult = await this.routePlanningEngine.planRoute(request);

    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { driverId: dto.driverId, tenantId },
      });
      if (driver) {
        const departureDate = new Date(dto.departureTime);
        // Estimate end date: departure + 3 days (conservative)
        const estimatedEnd = new Date(departureDate.getTime() + 3 * 24 * 60 * 60 * 1000);
        const unavail = await this.prisma.driverUnavailability.findFirst({
          where: {
            tenantId,
            driverId: driver.id,
            startDate: { lte: estimatedEnd },
            endDate: { gte: departureDate },
          },
        });
        if (unavail) {
          (routeResult as any).warnings = [
            ...((routeResult as any).warnings ?? []),
            {
              type: 'DRIVER_UNAVAILABLE',
              message: `Driver has ${unavail.type} scheduled ${unavail.startDate.toISOString().slice(0, 10)}–${unavail.endDate.toISOString().slice(0, 10)}`,
            },
          ];
        }
      }
    }

    return routeResult;
  }

  /**
   * Latest legal departure to still arrive by a deadline (backwards-from-appointment).
   * POST /routes/latest-departure
   */
  @Post('latest-departure')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Compute the latest legal departure that still arrives by a deadline' })
  async latestDeparture(
    @Body() body: { driverId: string; vehicleId: string; loadIds: string[]; mustArriveBy: string },
    @CurrentUser() user: any,
  ) {
    if (!body?.driverId || !body?.vehicleId || !body?.loadIds?.length || !body?.mustArriveBy) {
      throw new BadRequestException('driverId, vehicleId, loadIds and mustArriveBy are required');
    }
    const tenantId = await this.getTenantDbId(user);
    return this.routePlanningEngine.findLatestDeparture(
      {
        driverId: body.driverId,
        vehicleId: body.vehicleId,
        loadIds: body.loadIds,
        departureTime: new Date(),
        tenantId,
        _skipRelayDetection: true,
      },
      new Date(body.mustArriveBy),
    );
  }

  /**
   * Geocode all stops missing coordinates for the given loads.
   * POST /routes/geocode-stops
   */
  @Post('geocode-stops')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Geocode all stops missing coordinates for the given loads',
  })
  async geocodeStops(@Body() body: GeocodeStopsDto, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);

    const loads = await this.prisma.load.findMany({
      where: {
        loadNumber: { in: body.loadIds },
        tenantId,
      },
      include: {
        stops: {
          include: { stop: true },
        },
      },
    });

    const stopsToGeocode = loads
      .flatMap((load) => load.stops)
      .map((ls) => ls.stop)
      .filter((stop) => !stop.lat || !stop.lon);

    if (stopsToGeocode.length === 0) {
      return { geocoded: 0, failed: 0, total: 0 };
    }

    if (stopsToGeocode.length > 50) {
      throw new BadRequestException(`Too many stops to geocode (${stopsToGeocode.length}). Maximum 50 per request.`);
    }

    let geocoded = 0;
    let failed = 0;

    for (const stop of stopsToGeocode) {
      const result = await this.geocodingService.geocodeStop({
        address: stop.address,
        city: stop.city,
        state: stop.state,
        zipCode: stop.zipCode,
        name: stop.name,
      });

      if (result && result.confidence >= 0.5) {
        await this.prisma.stop.update({
          where: { id: stop.id },
          data: { lat: result.latitude, lon: result.longitude },
        });
        geocoded++;
      } else {
        failed++;
      }
    }

    return {
      geocoded,
      failed,
      total: stopsToGeocode.length,
    };
  }

  /**
   * List routes with optional filters.
   * GET /routes?status=active&limit=50&offset=0
   */
  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List route plans with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async listRoutes(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: any,
  ) {
    const tenantId = await this.getTenantDbId(user);

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    const result = await this.persistenceService.listPlans({
      tenantId,
      status,
      dateFrom,
      dateTo,
      limit: parsedLimit && parsedLimit > 0 ? Math.min(parsedLimit, 200) : undefined,
      offset: parsedOffset && parsedOffset >= 0 ? parsedOffset : undefined,
    });

    return result;
  }

  /**
   * Get driver's active route.
   * GET /routes/driver/:driverId/active
   */
  @Get('driver/:driverId/active')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Get driver's active route plan" })
  @ApiParam({ name: 'driverId', description: 'Driver ID' })
  async getDriverActiveRoute(@Param('driverId') driverId: string, @CurrentUser() user: any) {
    this.assertDriverScopedAccess(user, driverId);
    const tenantId = await this.getTenantDbId(user);

    // Resolve driver string ID to numeric ID
    const driver = await this.prisma.driver.findFirst({
      where: { driverId, tenantId },
    });

    if (!driver) {
      throw new NotFoundException(`Driver not found: ${driverId}`);
    }

    // Get active plan
    const plan = await this.persistenceService.getActivePlanForDriver(driver.id);

    return plan;
  }

  /**
   * Get GeoJSON representation of a route plan for Mapbox rendering.
   * GET /routes/:planId/geojson
   */
  @Get(':planId/geojson')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Get GeoJSON representation of a route plan for map rendering',
  })
  @ApiParam({ name: 'planId', description: 'Route plan ID' })
  async getGeoJSON(@Param('planId') planId: string, @CurrentUser() user: any) {
    const plan = await this.persistenceService.getPlanById(planId);
    await this.validateTenantAccess(plan.tenantId, user.tenantId);
    this.assertDriverScopedAccess(user, plan.driver?.driverId);
    return this.geojsonService.planToGeoJSON(plan);
  }

  /**
   * Get plan details by planId.
   * GET /routes/:planId
   */
  @Get(':planId')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get route plan details by ID' })
  @ApiParam({ name: 'planId', description: 'Route plan ID' })
  async getPlan(@Param('planId') planId: string, @CurrentUser() user: any) {
    const plan = await this.persistenceService.getPlanById(planId);

    // Validate tenant access
    await this.validateTenantAccess(plan.tenantId, user.tenantId);
    this.assertDriverScopedAccess(user, plan.driver?.driverId);
    return plan;
  }

  /**
   * Activate a route plan and auto-assign loads.
   * POST /routes/:planId/activate
   */
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @Post(':planId/activate')
  @ApiOperation({
    summary: 'Activate a route plan and auto-assign loads to the driver',
  })
  @ApiParam({ name: 'planId', description: 'Route plan ID to activate' })
  async activateRoute(
    @Param('planId') planId: string,
    @Body() body: { confirmReassignment?: boolean },
    @CurrentUser() user: any,
  ) {
    // First get the plan to validate tenant access
    const plan = await this.persistenceService.getPlanById(planId);
    await this.validateTenantAccess(plan.tenantId, user.tenantId);

    // Check for load reassignment conflicts
    if (!body?.confirmReassignment) {
      for (const rpl of (plan as any).loads ?? []) {
        const load = rpl.load;
        if (load.driverId && load.driverId !== (plan as any).driverId && load.status === 'ASSIGNED') {
          throw new ConflictException(
            `Load ${load.loadNumber} is assigned to a different driver. ` +
              `Set confirmReassignment: true to reassign.`,
          );
        }
      }
    }

    // Activate the plan
    const activated = await this.persistenceService.activatePlan(planId);

    return activated;
  }

  /**
   * Update a segment's status.
   * POST /routes/:planId/segments/:segmentId/status
   */
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @Post(':planId/segments/:segmentId/status')
  @ApiOperation({ summary: "Update a route segment's status" })
  @ApiParam({ name: 'planId', description: 'Route plan ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID to update' })
  async updateSegmentStatus(
    @Param('planId') planId: string,
    @Param('segmentId') segmentId: string,
    @Body()
    body: {
      status: string;
      actualArrival?: string;
      actualDeparture?: string;
    },
    @CurrentUser() user: any,
  ) {
    const tenantId = await this.getTenantDbId(user);

    if (!body?.status || !SEGMENT_STATUS_VALUES.includes(body.status as (typeof SEGMENT_STATUS_VALUES)[number])) {
      throw new BadRequestException(`Invalid status. Must be one of: ${SEGMENT_STATUS_VALUES.join(', ')}`);
    }

    return this.persistenceService.updateSegmentStatus(planId, segmentId, body, tenantId);
  }

  /**
   * Preview the impact of changing plan parameters WITHOUT persisting.
   * POST /routes/:planId/preview — powers the WhatIf panel's real "Estimated Impact".
   */
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @Post(':planId/preview')
  @ApiOperation({ summary: 'Preview a plan with changed params (no persistence) for the WhatIf panel' })
  @ApiParam({ name: 'planId', description: 'Route plan ID to base the preview on' })
  async previewPlan(
    @Param('planId') planId: string,
    @Body()
    body: {
      preferredRestType?: 'auto' | 'full' | 'split_8_2' | 'split_7_3';
      avoidTollRoads?: boolean;
      departureTimeShiftHours?: number;
    },
    @CurrentUser() user: any,
  ) {
    const tenantId = await this.getTenantDbId(user);
    const existingPlan = await this.persistenceService.getPlanById(planId);
    await this.validateTenantAccess(existingPlan.tenantId, user.tenantId);

    const loadIds = (existingPlan as any).loads.map((rpl: any) => rpl.load.loadNumber);
    const baseDeparture = existingPlan.departureTime ? new Date(existingPlan.departureTime) : new Date();
    const shiftedDeparture = body?.departureTimeShiftHours
      ? new Date(baseDeparture.getTime() + body.departureTimeShiftHours * 3600000)
      : baseDeparture;

    const existingParams = (existingPlan.dispatcherParams as any) ?? {};
    const request: RoutePlanRequest = {
      driverId: (existingPlan as any).driver.driverId,
      vehicleId: (existingPlan as any).vehicle.vehicleId,
      loadIds,
      departureTime: shiftedDeparture,
      tenantId,
      optimizationPriority: (existingPlan.optimizationPriority as any) ?? 'minimize_time',
      _skipRelayDetection: true,
      dispatcherParams: {
        ...existingParams,
        preferredRestType: body?.preferredRestType ?? existingParams.preferredRestType,
        avoidTollRoads: body?.avoidTollRoads ?? existingParams.avoidTollRoads,
      },
    };

    const preview = await this.routePlanningEngine.previewRoute(request);
    return {
      totalDistanceMiles: preview.totalDistanceMiles,
      totalDriveTimeHours: preview.totalDriveTimeHours,
      totalTripTimeHours: preview.totalTripTimeHours,
      totalDrivingDays: preview.totalDrivingDays,
      totalCostEstimate: preview.totalCostEstimate,
      estimatedArrival: preview.estimatedArrival,
      isFeasible: preview.isFeasible,
      feasibilityIssues: preview.feasibilityIssues,
      costBreakdown: preview.costBreakdown,
      complianceReport: preview.complianceReport,
    };
  }

  /**
   * Replan an active route from driver's current position.
   * POST /routes/:planId/replan
   */
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @Post(':planId/replan')
  @ApiOperation({
    summary: "Replan an active route from the driver's current position",
  })
  @ApiParam({ name: 'planId', description: 'Active route plan ID to replan' })
  async replanRoute(@Param('planId') planId: string, @Body() body: { reason?: string }, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);

    // 1. Load existing plan
    const existingPlan = await this.persistenceService.getPlanById(planId);
    await this.validateTenantAccess(existingPlan.tenantId, user.tenantId);

    const replanablePlanStatuses: RoutePlanStatus[] = [RoutePlanStatus.ACTIVE, RoutePlanStatus.DRAFT];
    if (!replanablePlanStatuses.includes(existingPlan.status)) {
      throw new BadRequestException('Can only replan active or draft route plans');
    }

    // 2. Identify completed segments and remaining load stops
    const completedStopIds = existingPlan.segments
      .filter(
        (s: any) =>
          s.segmentType === 'dock' &&
          (s.status === RouteSegmentStatus.COMPLETED || s.status === RouteSegmentStatus.SKIPPED),
      )
      .map((s: any) => s.stopId)
      .filter(Boolean);

    // 3. Get load numbers from existing plan
    const loadIds = (existingPlan as any).loads.map((rpl: any) => rpl.load.loadNumber);

    // 4. Build replan request
    const request: RoutePlanRequest = {
      driverId: (existingPlan as any).driver.driverId,
      vehicleId: (existingPlan as any).vehicle.vehicleId,
      loadIds,
      departureTime: new Date(),
      tenantId,
      optimizationPriority: (existingPlan.optimizationPriority as any) ?? 'minimize_time',
      startFromCurrentLocation: true,
      excludeCompletedStops: completedStopIds,
      dispatcherParams: existingPlan.dispatcherParams as any,
    };

    // 5. Generate new plan (replan always targets a single standard plan, not relay)
    const newPlan = await this.routePlanningEngine.planRoute({
      ...request,
      _skipRelayDetection: true,
    });

    // 6. Supersede old plan
    const newPlanRecord = await this.prisma.routePlan.findUnique({
      where: { planId: (newPlan as any).planId },
      select: { id: true },
    });

    if (newPlanRecord) {
      await this.persistenceService.supersedePlan(planId, newPlanRecord.id);
    }

    // 7. Log replan event
    await this.prisma.routeEvent.create({
      data: {
        eventId: `EVT-${crypto.randomUUID()}`,
        planId: (existingPlan as any).id,
        eventType: 'REPLAN_REQUESTED',
        source: 'dispatcher',
        occurredAt: new Date(),
        eventData: {
          reason: body?.reason ?? 'Manual replan',
          newPlanId: (newPlan as any).planId,
        },
      },
    });

    return newPlan;
  }

  /**
   * Cancel a route plan.
   * POST /routes/:planId/cancel
   */
  @Post(':planId/cancel')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Cancel an active route plan' })
  @ApiParam({ name: 'planId', description: 'Route plan ID to cancel' })
  async cancelRoute(@Param('planId') planId: string, @CurrentUser() user: any) {
    // First get the plan to validate tenant access
    const plan = await this.persistenceService.getPlanById(planId);
    await this.validateTenantAccess(plan.tenantId, user.tenantId);

    // Cancel the plan
    const cancelled = await this.persistenceService.cancelPlan(planId);

    return cancelled;
  }

  /**
   * Discard a draft route plan.
   * DELETE /routes/:planId/draft
   */
  @Delete(':planId/draft')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Discard a draft route plan' })
  @ApiParam({ name: 'planId', description: 'Draft route plan ID to discard' })
  async discardDraft(@Param('planId') planId: string, @CurrentUser() user: any) {
    const plan = await this.persistenceService.getPlanById(planId);
    await this.validateTenantAccess(plan.tenantId, user.tenantId);

    if (plan.status !== RoutePlanStatus.DRAFT) {
      throw new BadRequestException(`Only draft plans can be discarded. Current status: ${plan.status}`);
    }

    return this.persistenceService.cancelPlan(planId);
  }

  /**
   * Submit feedback for a route segment.
   * POST /routes/:planId/segments/:segmentId/feedback
   */
  @Post(':planId/segments/:segmentId/feedback')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Submit feedback for a route segment' })
  @ApiParam({ name: 'planId', description: 'Route plan ID' })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  async submitSegmentFeedback(
    @Param('planId') planId: string,
    @Param('segmentId') segmentId: string,
    @Body() body: SubmitFeedbackDto,
    @CurrentUser() user: any,
  ) {
    const tenantId = await this.getTenantDbId(user);

    return this.feedbackService.submitFeedback({
      planId,
      segmentId,
      rating: body.rating,
      reason: body.reason,
      userId: user.dbId,
      tenantId,
    });
  }
}
