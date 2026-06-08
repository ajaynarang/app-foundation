import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { FEATURE_KEYS } from '@sally/shared-types';
import { UserRole } from '@prisma/client';
import { LoadsService } from '../services/loads.service';
import { LoadChargesService } from '../services/load-charges.service';
import { LoadNotesService } from '../services/load-notes.service';
import { LoadEventsService } from '../services/load-events.service';
import { LoadReversalService } from '../services/load-reversal.service';
import { LoadLegService } from '../services/load-leg.service';
import { DriverRecommendationService } from '../services/driver-recommendation.service';
import { DispatchSheetPdfService } from '../services/dispatch-sheet-pdf.service';
import { DispatchSheetEmailService } from '../services/dispatch-sheet-email.service';
import {
  RoutePlanningEngineService,
  RoutePlanRequest,
} from '../../../routing/route-planning/services/route-planning-engine.service';
import { RoutePlanPersistenceService } from '../../../routing/route-planning/services/route-plan-persistence.service';
import {
  CreateLoadDto,
  UpdateDraftLoadDto,
  RevertLoadDto,
  CreateLegsDto,
  AssignLegDto,
  AssignAllLegsDto,
  UpdateLegStatusDto,
  RemoveExchangeQueryDto,
} from '../dto';
import { UpdateStopStatusDto } from '../dto/update-stop-status.dto';
import { CreateLoadChargeDto, UpdateLoadChargeDto } from '../dto/load-charge.dto';
import { CreateLoadNoteDto } from '../dto/load-note.dto';
import { GenerateRouteDto } from '../dto/generate-route.dto';
import { IsString, MinLength, MaxLength } from 'class-validator';

class RevertDeliveryDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;
}

@ApiTags('Loads')
@ApiBearerAuth()
@Controller('loads')
export class LoadsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly loadsService: LoadsService,
    private readonly loadChargesService: LoadChargesService,
    private readonly loadNotesService: LoadNotesService,
    private readonly loadEventsService: LoadEventsService,
    private readonly loadReversalService: LoadReversalService,
    private readonly loadLegService: LoadLegService,
    private readonly driverRecommendationService: DriverRecommendationService,
    private readonly routePlanningEngine: RoutePlanningEngineService,
    private readonly routePlanPersistence: RoutePlanPersistenceService,
    private readonly dispatchSheetPdfService: DispatchSheetPdfService,
    private readonly dispatchSheetEmailService: DispatchSheetEmailService,
  ) {
    super(prisma);
  }

  /**
   * Verify a DRIVER user is assigned to the given load.
   * Non-driver roles skip this check.
   */
  private async assertDriverLoadAccess(user: any, loadNumber: string, tenantDbId: number): Promise<void> {
    if (user.role !== 'DRIVER') return;

    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId: tenantDbId },
      select: { id: true, driverId: true, isRelay: true },
    });
    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }

    // Relay loads: check if driver is assigned to any leg
    if (load.isRelay) {
      const isLegDriver = await this.prisma.loadLeg.findFirst({
        where: { loadId: load.id, driverId: user.driverDbId },
      });
      if (!isLegDriver) {
        throw new BadRequestException('You are not assigned to any leg of this relay load');
      }
      return;
    }

    // user.driverDbId is the numeric Driver PK from the JWT payload
    if (!user.driverDbId || user.driverDbId !== load.driverId) {
      throw new BadRequestException('You are not assigned to this load');
    }
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a new load with stops' })
  async createLoad(@CurrentUser() user: any, @Body() createLoadDto: CreateLoadDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.loadsService.create({
      ...createLoadDto,
      equipmentType: createLoadDto.requiredEquipmentType,
      tenantId: tenantDbId,
    });
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'List all loads with filtering, search, and sort' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'customerName', required: false })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'equipmentType', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listLoads(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('customerName') customerName?: string,
    @Query('driverId') driverId?: string,
    @Query('equipmentType') equipmentType?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    const tenantDbId = await this.getTenantDbId(user);

    // Drivers can only see their own loads — force driverId filter
    if (user.role === 'DRIVER') {
      driverId = user.driverId;
    }

    return this.loadsService.findAll(
      tenantDbId,
      {
        status,
        customerName,
        driverId,
        equipmentType,
        search,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
      },
      {
        limit: Number(limit),
        offset: Number(offset),
      },
    );
  }

  @Get('board')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'List the full active set for the dispatcher kanban board',
    description:
      'Returns every load in DRAFT/PENDING/ASSIGNED/IN_TRANSIT/ON_HOLD for the tenant. ' +
      'Intentionally unpaginated — the kanban must show the complete active set so cards never silently drop. ' +
      'Capped at the platform-wide MAX_PAGE_LIMIT for memory safety; tenants approaching the cap are warned in logs.',
  })
  async listActiveBoard(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.loadsService.findActiveBoard(tenantDbId);
  }

  @Get(':load_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Get load details with stops' })
  async getLoad(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.assertDriverLoadAccess(user, loadId, tenantDbId);
    return this.loadsService.findOne(loadId, tenantDbId);
  }

  @Patch(':load_id/status')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update load status' })
  async updateLoadStatus(@Param('load_id') loadId: string, @Body() body: { status: string; reason?: string }) {
    return this.loadsService.updateStatus(loadId, body.status, {
      reason: body.reason,
    });
  }

  /** @deprecated Use POST :load_id/revert instead. Delegates to LoadReversalService. */
  @Post(':load_id/revert-delivery')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: '[Deprecated] Revert a delivered load — use /revert instead',
    deprecated: true,
  })
  async revertDelivery(@Param('load_id') loadId: string, @Body() body: RevertDeliveryDto, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const dbUser = await this.prisma.user.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    // Delegate to new unified reversal service
    await this.loadReversalService.executeReversal(
      tenantDbId,
      loadId,
      'IN_TRANSIT',
      'dispatcher_correction',
      body.reason.trim(),
      dbUser?.id ?? 0,
      user.role,
    );
    return this.loadsService.findOne(loadId, tenantDbId);
  }

  @Get(':load_id/revert-preview')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Preview impact of reverting a load to a prior status',
  })
  @ApiQuery({
    name: 'targetStatus',
    required: true,
    enum: ['PENDING', 'ASSIGNED', 'IN_TRANSIT'],
    description: 'The status to revert the load to',
  })
  async previewReversal(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Query('targetStatus') targetStatus: string,
  ) {
    if (!targetStatus || !['PENDING', 'ASSIGNED', 'IN_TRANSIT'].includes(targetStatus)) {
      throw new BadRequestException(
        'targetStatus query param is required and must be one of: PENDING, ASSIGNED, IN_TRANSIT',
      );
    }
    const tenantDbId = await this.getTenantDbId(user);
    return this.loadReversalService.previewReversal(tenantDbId, loadId, targetStatus);
  }

  @Post(':load_id/revert')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Revert a load to a prior status' })
  async revertLoad(@Param('load_id') loadId: string, @Body() body: RevertLoadDto, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const dbUser = await this.prisma.user.findUnique({
      where: { userId: user.userId },
      select: { id: true, role: true },
    });
    if (!dbUser) {
      throw new BadRequestException('User not found');
    }

    await this.loadReversalService.executeReversal(
      tenantDbId,
      loadId,
      body.targetStatus,
      body.category,
      body.reason.trim(),
      dbUser.id,
      dbUser.role,
    );

    // Return via findOne for consistent response formatting
    return this.loadsService.findOne(loadId, tenantDbId);
  }

  @Patch(':load_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a load (draft, pending, or assigned)' })
  async updateDraftLoad(@Param('load_id') loadId: string, @Body() body: UpdateDraftLoadDto) {
    return this.loadsService.updateDraft(loadId, {
      ...body,
      equipmentType: body.requiredEquipmentType,
    });
  }

  @Post(':load_id/assign')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Assign driver and vehicle to load' })
  async assignLoad(
    @Param('load_id') loadId: string,
    @Body()
    body: { driverId: string; vehicleId: string; trailerId?: string },
  ) {
    return this.loadsService.assignLoad(loadId, body.driverId, body.vehicleId, body.trailerId);
  }

  @Delete(':load_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete a draft load' })
  async deleteLoad(@Param('load_id') loadId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.loadsService.deleteLoad(loadId, tenantDbId);
  }

  @Post(':load_id/tracking-token')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Generate tracking token for load' })
  async generateTrackingToken(@Param('load_id') loadId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const userDbId = await this.getUserDbId(user.userId);
    return this.loadsService.generateTrackingToken(loadId, tenantDbId, userDbId);
  }

  @Post(':load_id/duplicate')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Duplicate an existing load' })
  async duplicateLoad(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.loadsService.duplicate(loadId, tenantDbId);
  }

  // ── Relay Leg endpoints ──

  @Get(':load_id/legs')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'List legs for a relay load' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  async getLegs(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: { id: true, isRelay: true },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);
    if (!load.isRelay) {
      throw new BadRequestException('Load is not a relay load');
    }

    const legs = await this.loadLegService.getLegsForLoad(load.id, tenantDbId);

    // Drivers: scope to their own legs only
    if (user.role === 'DRIVER' && user.driverDbId) {
      return legs.filter((leg: any) => leg.driverId === user.driverDbId);
    }

    return legs;
  }

  @Post(':load_id/legs')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create or update legs from exchange points' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  async createLegs(@CurrentUser() user: any, @Param('load_id') loadId: string, @Body() body: CreateLegsDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);

    return this.loadLegService.createLegsFromExchangePoints(load.id, body.exchangeStopIds, tenantDbId);
  }

  @Get(':load_id/exchanges/:stop_id/preview')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Preview the effect of removing an exchange point',
    description:
      'Returns the inferred resolution (delete vs revert) the corresponding DELETE call would apply, or `ambiguous: true` when no clear inference exists. Drives the confirmation copy in the UI.',
  })
  @ApiParam({ name: 'load_id', description: 'Load number (e.g. LD-2026-001)' })
  @ApiParam({ name: 'stop_id', description: 'Numeric Stop primary key' })
  async previewRemoveExchange(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Param('stop_id', ParseIntPipe) stopIdNum: number,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);
    return this.loadLegService.previewExchangeRemoval(load.id, stopIdNum, tenantDbId);
  }

  @Delete(':load_id/exchanges/:stop_id')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Remove an exchange point from a relay load',
    description:
      'Server infers whether to delete the stop entirely (Pattern A — truck stop / rest area added for the swap) or revert it to a delivery (Pattern B — promoted customer stop). On ambiguous, returns 409 — retry with ?resolve=delete or ?resolve=revert. Legs are recomputed; if zero exchanges remain, the load demotes off isRelay.',
  })
  @ApiParam({ name: 'load_id', description: 'Load number' })
  @ApiParam({ name: 'stop_id', description: 'Numeric Stop primary key' })
  @ApiQuery({ name: 'resolve', required: false, enum: ['delete', 'revert'] })
  async removeExchange(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Param('stop_id', ParseIntPipe) stopIdNum: number,
    @Query() query: RemoveExchangeQueryDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);
    return this.loadLegService.removeExchangePoint(load.id, stopIdNum, tenantDbId, query.resolve);
  }

  @Post(':load_id/assign-all-legs')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Assign drivers/vehicles to all legs of a relay load at once',
  })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  async assignAllLegs(@CurrentUser() user: any, @Param('load_id') loadId: string, @Body() body: AssignAllLegsDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.loadsService.assignAllLegs(loadId, body.assignments, tenantDbId);
  }

  @Patch(':load_id/legs/:leg_id/assign')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Assign driver and vehicle to a relay leg' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  @ApiParam({ name: 'leg_id', description: 'Leg ID' })
  async assignLeg(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Param('leg_id') legId: string,
    @Body() body: AssignLegDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    // Validate load exists and belongs to tenant
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);

    return this.loadLegService.assignLeg(legId, body.driverId, body.vehicleId, tenantDbId, body.trailerId);
  }

  @Patch(':load_id/legs/:leg_id/status')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Advance relay leg status' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  @ApiParam({ name: 'leg_id', description: 'Leg ID' })
  async updateLegStatus(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Param('leg_id') legId: string,
    @Body() body: UpdateLegStatusDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    // Validate load exists and belongs to tenant
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);

    return this.loadLegService.advanceLegStatus(legId, body.status, tenantDbId);
  }

  @Get(':load_id/legs/:leg_id/dispatch-sheet')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Get dispatch sheet data for a leg' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  @ApiParam({ name: 'leg_id', description: 'Leg ID' })
  async getLegDispatchSheet(
    @Param('load_id') loadId: string,
    @Param('leg_id') legId: string,
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.assertDriverLegAccess(user, legId, loadId, tenantDbId);
    return this.loadLegService.getDispatchSheet(legId, tenantDbId);
  }

  @Get(':load_id/legs/:leg_id/dispatch-sheet/pdf')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Download dispatch sheet as PDF' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  @ApiParam({ name: 'leg_id', description: 'Leg ID' })
  async getLegDispatchSheetPdf(
    @Param('load_id') loadId: string,
    @Param('leg_id') legId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.assertDriverLegAccess(user, legId, loadId, tenantDbId);

    const data = await this.loadLegService.getDispatchSheet(legId, tenantDbId);
    const { companyName, settings } = await this.resolveCompanyInfo(tenantDbId);

    // Build company address for PDF header
    const addressParts = [
      settings?.address,
      [settings?.city, settings?.state].filter(Boolean).join(', '),
      settings?.zip,
    ].filter(Boolean);
    const companyAddress = addressParts.length > 0 ? addressParts.join(' ') : null;

    const pdfBuffer = await this.dispatchSheetPdfService.generatePdf(
      data,
      companyName,
      settings?.mcNumber,
      settings?.dotNumber,
      settings?.phone,
      companyAddress,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dispatch-sheet-${data.loadNumber}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }

  @Post(':load_id/legs/:leg_id/dispatch-sheet/send')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Email dispatch sheet to assigned driver' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  @ApiParam({ name: 'leg_id', description: 'Leg ID' })
  async sendLegDispatchSheet(
    @Param('load_id') loadId: string,
    @Param('leg_id') legId: string,
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);

    // Get the leg with driver info
    const leg = await this.prisma.loadLeg.findFirst({
      where: { legId, load: { loadNumber: loadId }, tenantId: tenantDbId },
      include: { driver: { select: { email: true, name: true } } },
    });

    if (!leg) throw new NotFoundException('Leg not found');
    if (!leg.driver) throw new BadRequestException('No driver assigned to this leg');
    if (!leg.driver.email) throw new BadRequestException('Driver has no email address on file');

    const data = await this.loadLegService.getDispatchSheet(legId, tenantDbId);
    const { companyName, settings } = await this.resolveCompanyInfo(tenantDbId);

    return this.dispatchSheetEmailService.sendDispatchSheet(data, leg.driver.email, companyName, settings);
  }

  // ─── Load-level dispatch sheet (non-relay loads) ────────────────────────────

  @Get(':load_id/dispatch-sheet/pdf')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Download dispatch sheet PDF for a non-relay load' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  async getLoadDispatchSheetPdf(@Param('load_id') loadId: string, @CurrentUser() user: any, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);

    // Driver access: verify they own this load
    if (user.role === 'DRIVER' && user.driverDbId) {
      const load = await this.prisma.load.findFirst({
        where: { loadNumber: loadId, tenantId: tenantDbId },
        select: { driverId: true },
      });
      if (!load) throw new NotFoundException('Load not found');
      if (load.driverId !== user.driverDbId) {
        throw new ForbiddenException('You can only access your own dispatch sheets');
      }
    }

    const data = await this.loadLegService.getDispatchSheetForLoad(loadId, tenantDbId);
    const { companyName, settings } = await this.resolveCompanyInfo(tenantDbId);

    const addressParts = [
      settings?.address,
      [settings?.city, settings?.state].filter(Boolean).join(', '),
      settings?.zip,
    ].filter(Boolean);
    const companyAddress = addressParts.length > 0 ? addressParts.join(' ') : null;

    const pdfBuffer = await this.dispatchSheetPdfService.generatePdf(
      data,
      companyName,
      settings?.mcNumber,
      settings?.dotNumber,
      settings?.phone,
      companyAddress,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dispatch-sheet-${data.loadNumber}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }

  @Post(':load_id/dispatch-sheet/send')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Email dispatch sheet to assigned driver (non-relay load)',
  })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  async sendLoadDispatchSheet(@Param('load_id') loadId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);

    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      include: { driver: { select: { email: true, name: true } } },
    });

    if (!load) throw new NotFoundException('Load not found');
    if (!load.driver) throw new BadRequestException('No driver assigned to this load');
    if (!load.driver.email) throw new BadRequestException('Driver has no email address on file');

    const data = await this.loadLegService.getDispatchSheetForLoad(loadId, tenantDbId);
    const { companyName, settings } = await this.resolveCompanyInfo(tenantDbId);

    return this.dispatchSheetEmailService.sendDispatchSheet(data, load.driver.email, companyName, settings);
  }

  @Get(':load_id/driver-view')
  @RequireFeature(FEATURE_KEYS.RELAY_LOADS)
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Get driver-scoped view of a relay load' })
  @ApiParam({ name: 'load_id', description: 'Load ID' })
  async getDriverView(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: {
        id: true,
        loadNumber: true,
        status: true,
        isRelay: true,
        customerName: true,
        commodityType: true,
        weightLbs: true,
        requiredEquipmentType: true,
        specialRequirements: true,
      },
    });

    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);

    if (!load.isRelay) {
      throw new BadRequestException(
        'Driver view endpoint is only for relay loads. Use GET /loads/:load_id for standard loads.',
      );
    }

    // Find legs for this driver
    const allLegs = await this.prisma.loadLeg.findMany({
      where: { loadId: load.id, tenantId: tenantDbId },
      orderBy: { sequence: 'asc' },
      include: {
        originStop: { include: { stop: true } },
        destStop: { include: { stop: true } },
      },
    });

    const driverLegs = allLegs.filter((leg) => leg.driverId === user.driverDbId);

    if (driverLegs.length === 0) {
      throw new ForbiddenException('You are not assigned to any leg of this relay load');
    }

    const totalLegs = allLegs.length;
    const maxSequence = Math.max(...allLegs.map((l) => l.sequence));

    return driverLegs.map((leg) => ({
      legId: leg.legId,
      legSequence: leg.sequence,
      totalLegs,
      isRelay: true,
      isFinalLeg: leg.sequence === maxSequence,
      status: leg.status,
      loadNumber: load.loadNumber,
      loadStatus: load.status,
      customerName: load.customerName,
      commodityType: load.commodityType,
      weightLbs: load.weightLbs,
      requiredEquipmentType: load.requiredEquipmentType ?? null,
      specialRequirements: load.specialRequirements,
      originStop: leg.originStop
        ? {
            id: leg.originStop.id,
            actionType: leg.originStop.actionType,
            stopName: leg.originStop.stop?.name || null,
            stopCity: leg.originStop.stop?.city || null,
            stopState: leg.originStop.stop?.state || null,
            stopAddress: leg.originStop.stop?.address || null,
          }
        : null,
      destStop: leg.destStop
        ? {
            id: leg.destStop.id,
            actionType: leg.destStop.actionType,
            stopName: leg.destStop.stop?.name || null,
            stopCity: leg.destStop.stop?.city || null,
            stopState: leg.destStop.stop?.state || null,
            stopAddress: leg.destStop.stop?.address || null,
          }
        : null,
    }));
  }

  // ��─ Stop status endpoints ──

  @Patch(':load_id/stops/:stop_id/status')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Update stop status (arrived/in_progress/completed)',
  })
  async updateStopStatus(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Param('stop_id') stopId: string,
    @Body() body: UpdateStopStatusDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.assertDriverLoadAccess(user, loadId, tenantDbId);

    // DTO `@IsIn(FORWARD_STOP_STATUSES)` already rejected PENDING/IN_TRANSIT at runtime.
    return this.loadsService.updateStopStatus(
      loadId,
      Number(stopId),
      body.status as Exclude<typeof body.status, 'PENDING' | 'IN_TRANSIT'>,
      user.userId,
      tenantDbId,
    );
  }

  @Get(':load_id/stops')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get stops for a load' })
  async getStops(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.assertDriverLoadAccess(user, loadId, tenantDbId);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    return load.stops;
  }

  // ── Charges endpoints ──

  @Post(':load_id/charges')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Add a charge to a load' })
  async addCharge(@CurrentUser() user: any, @Param('load_id') loadId: string, @Body() dto: CreateLoadChargeDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    return this.loadChargesService.addCharge({
      loadId: load.id,
      chargeType: dto.chargeType,
      description: dto.description,
      quantity: dto.quantity,
      unitPriceCents: dto.unitPriceCents,
      isBillable: dto.isBillable,
      isPayable: dto.isPayable,
    });
  }

  @Get(':load_id/charges')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get charges for a load' })
  async getCharges(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    return this.loadChargesService.getCharges(load.id);
  }

  @Patch(':load_id/charges/:charge_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a charge' })
  async updateCharge(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Param('charge_id') chargeId: string,
    @Body() dto: UpdateLoadChargeDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    // Verify charge belongs to this load
    const charges = await this.loadChargesService.getCharges(load.id);
    if (!charges.some((c: any) => c.id === Number(chargeId))) {
      throw new NotFoundException(`Charge not found on this load`);
    }
    return this.loadChargesService.updateCharge(Number(chargeId), {
      description: dto.description,
      quantity: dto.quantity,
      unitPriceCents: dto.unitPriceCents,
      isBillable: dto.isBillable,
      isPayable: dto.isPayable,
    });
  }

  @Delete(':load_id/charges/:charge_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Remove a charge' })
  async removeCharge(@CurrentUser() user: any, @Param('load_id') loadId: string, @Param('charge_id') chargeId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    const charges = await this.loadChargesService.getCharges(load.id);
    if (!charges.some((c: any) => c.id === Number(chargeId))) {
      throw new NotFoundException(`Charge not found on this load`);
    }
    return this.loadChargesService.removeCharge(Number(chargeId));
  }

  // ── Notes endpoints ──

  @Post(':load_id/notes')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Add a note to a load' })
  async addNote(@CurrentUser() user: any, @Param('load_id') loadId: string, @Body() dto: CreateLoadNoteDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    return this.loadNotesService.addNote({
      loadId: load.id,
      userId: user.dbId,
      content: dto.content,
      noteType: dto.noteType,
    });
  }

  @Get(':load_id/notes')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get notes for a load' })
  async getNotes(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    return this.loadNotesService.getNotes(load.id);
  }

  @Patch(':load_id/notes/:note_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Toggle pin on a note' })
  async pinNote(@CurrentUser() user: any, @Param('load_id') loadId: string, @Param('note_id') noteId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    const notes = await this.loadNotesService.getNotes(load.id);
    if (!notes.some((n: any) => n.id === Number(noteId))) {
      throw new NotFoundException(`Note not found on this load`);
    }
    return this.loadNotesService.pinNote(Number(noteId));
  }

  @Delete(':load_id/notes/:note_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete a note' })
  async deleteNote(@CurrentUser() user: any, @Param('load_id') loadId: string, @Param('note_id') noteId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);
    const notes = await this.loadNotesService.getNotes(load.id);
    if (!notes.some((n: any) => n.id === Number(noteId))) {
      throw new NotFoundException(`Note not found on this load`);
    }
    return this.loadNotesService.deleteNote(Number(noteId));
  }

  // ── Activity feed endpoint ──

  @Get(':load_id/activity')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get merged activity feed (events + notes)' })
  async getActivity(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const load = await this.loadsService.findOne(loadId, tenantDbId);

    const [events, notes] = await Promise.all([
      this.loadEventsService.getEvents(load.id),
      this.loadNotesService.getNotes(load.id),
    ]);

    const activity = [
      ...events.map((e: any) => ({
        type: 'event' as const,
        id: e.id,
        eventType: e.eventType,
        fromValue: e.fromValue,
        toValue: e.toValue,
        description: e.description,
        userId: e.userId,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
      })),
      ...notes.map((n: any) => ({
        type: 'note' as const,
        id: n.id,
        content: n.content,
        noteType: n.noteType,
        isPinned: n.isPinned,
        userId: n.userId,
        createdAt: n.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return activity;
  }

  // ── Smart Routes endpoints ──

  @Get(':load_id/driver-recommendations')
  @RequireFeature('route_planning')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get ranked driver recommendations for a load' })
  @ApiParam({
    name: 'load_id',
    description: 'Load ID to get driver recommendations for',
  })
  async getDriverRecommendations(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const recommendations = await this.driverRecommendationService.getRecommendations(loadId, tenantDbId);
    return { recommendations };
  }

  @Post(':load_id/generate-route')
  @RequireFeature('route_planning')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Generate a draft route plan for a load' })
  @ApiParam({ name: 'load_id', description: 'Load ID to generate a route for' })
  async generateRoute(@CurrentUser() user: any, @Param('load_id') loadId: string, @Body() body: GenerateRouteDto) {
    const tenantId = await this.getTenantDbId(user);

    const request: RoutePlanRequest = {
      driverId: body.driverId,
      vehicleId: body.vehicleId,
      loadIds: [loadId],
      departureTime: new Date(body.departureTime),
      tenantId,
      optimizationPriority: body.optimizationPriority,
      dispatcherParams: {
        preferredRestType: body.restPreference as 'auto' | 'full' | 'split_8_2' | 'split_7_3' | undefined,
        avoidTollRoads: body.avoidTolls,
        maxDetourMilesForFuel: body.maxFuelDetourMiles,
      },
      ...(body.legDriverMap && { legDriverMap: body.legDriverMap }),
    };

    return this.routePlanningEngine.planRoute(request);
  }

  @Post(':load_id/assign-with-route')
  @RequireFeature('route_planning')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Activate a route plan and auto-assign the load to the driver',
  })
  @ApiParam({
    name: 'load_id',
    description: 'Load ID to assign with route plan',
  })
  async assignWithRoute(@CurrentUser() user: any, @Param('load_id') loadId: string, @Body() body: { planId: string }) {
    await this.getTenantDbId(user);

    // Validate the plan belongs to this tenant before activating
    const plan = await this.routePlanPersistence.getPlanById(body.planId);
    await this.validateTenantAccess(plan.tenantId, user.tenantId);

    // Verify the plan actually covers this load (loadId param holds loadNumber)
    const planLoadNumbers = plan.loads.map((rpl: any) => rpl.load.loadNumber as string);
    if (!planLoadNumbers.includes(loadId)) {
      throw new BadRequestException(`Route plan ${body.planId} does not include load ${loadId}`);
    }

    // activatePlan handles: deactivating prior plans, assigning loads to driver/vehicle
    return this.routePlanPersistence.activatePlan(body.planId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Verify a DRIVER can only access their own leg. No-op for other roles. */
  private async assertDriverLegAccess(user: any, legId: string, loadNumber: string, tenantId: number) {
    if (user.role !== 'DRIVER') return;
    const leg = await this.prisma.loadLeg.findFirst({
      where: { legId, load: { loadNumber }, tenantId },
    });
    if (!leg || (user.driverDbId && leg.driverId !== user.driverDbId)) {
      throw new ForbiddenException('You can only view your own leg dispatch sheet');
    }
  }

  /** Resolve company name and invoice settings for PDF/email generation. */
  private async resolveCompanyInfo(tenantId: number) {
    const settings = await this.prisma.invoiceSettings.findUnique({
      where: { tenantId },
    });
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true },
    });
    return {
      companyName: settings?.companyLegalName || tenant?.companyName || 'Company',
      settings,
    };
  }
}
