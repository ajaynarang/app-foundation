import { Controller, Post, Get, Put, Param, Body, Query, Delete, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SettlementsService } from '../services/settlements.service';
import { SettlementPdfService } from '../services/settlement-pdf.service';
import { CalculateSettlementDto, AddDeductionDto } from '../dto';
import {
  BatchCalculateDto,
  BatchSettlementActionDto,
  PreviewBatchDto,
  UpdateNotesDto,
} from '../dto/batch-settlement.dto';

@ApiTags('Settlements')
@ApiBearerAuth()
@Controller('settlements')
export class SettlementsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly settlementsService: SettlementsService,
    private readonly pdfService: SettlementPdfService,
  ) {
    super(prisma);
  }

  // --- Driver self-service (read-only) ---

  @Get('my-settlements')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'List own settlements (driver self-service)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findMySettlements(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    this.assertHasDriverProfile(user);
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.findAll(
      tenantDbId,
      { status, driverId: user.driverId },
      { limit: Number(limit), offset: Number(offset) },
    );
  }

  @Get('my-settlements/:settlement_id')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Get own settlement detail (driver self-service)' })
  async findMySettlement(@CurrentUser() user: any, @Param('settlement_id') settlementId: string) {
    this.assertHasDriverProfile(user);
    const tenantDbId = await this.getTenantDbId(user);
    const settlement = await this.settlementsService.findOne(tenantDbId, settlementId);
    this.assertDriverScopedAccess(user, settlement.driver?.driverId);
    return settlement;
  }

  @Get('my-settlements/:settlement_id/pdf')
  @Roles(UserRole.DRIVER)
  @ApiOperation({
    summary: 'Download own settlement PDF (driver self-service)',
  })
  async downloadMySettlementPdf(
    @CurrentUser() user: any,
    @Param('settlement_id') settlementId: string,
    @Res() res: Response,
  ) {
    this.assertHasDriverProfile(user);
    const tenantDbId = await this.getTenantDbId(user);
    const settlement = await this.settlementsService.findOne(tenantDbId, settlementId);
    this.assertDriverScopedAccess(user, settlement.driver?.driverId);
    const buffer = await this.pdfService.generatePdf(tenantDbId, settlementId);
    const safeFilename = settlement.settlementNumber.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFilename}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // --- Single settlement operations ---

  @Post('calculate')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Calculate settlement for driver in period' })
  async calculate(@CurrentUser() user: any, @Body() dto: CalculateSettlementDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.calculate(tenantDbId, dto);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List settlements with filtering, search, sort' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'periodStart', required: false })
  @ApiQuery({ name: 'periodEnd', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
    @Query('search') search?: string,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.findAll(
      tenantDbId,
      { status, driverId, search, periodStart, periodEnd, sortBy, sortOrder },
      { limit: Number(limit), offset: Number(offset) },
    );
  }

  @Get('summary')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Settlement summary stats' })
  @ApiQuery({ name: 'periodStart', required: false })
  @ApiQuery({ name: 'periodEnd', required: false })
  async getSummary(
    @CurrentUser() user: any,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.getSummary(tenantDbId, {
      periodStart,
      periodEnd,
    });
  }

  @Get(':settlement_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get settlement detail' })
  async findOne(@CurrentUser() user: any, @Param('settlement_id') settlementId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.findOne(tenantDbId, settlementId);
  }

  @Post(':settlement_id/deductions')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Add deduction to settlement' })
  async addDeduction(
    @CurrentUser() user: any,
    @Param('settlement_id') settlementId: string,
    @Body() dto: AddDeductionDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.addDeduction(tenantDbId, settlementId, dto);
  }

  @Delete(':settlement_id/deductions/:deduction_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Remove deduction from settlement' })
  async removeDeduction(
    @CurrentUser() user: any,
    @Param('settlement_id') settlementId: string,
    @Param('deduction_id') deductionId: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.removeDeduction(tenantDbId, settlementId, Number(deductionId));
  }

  @Post(':settlement_id/approve')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Approve settlement' })
  async approve(@CurrentUser() user: any, @Param('settlement_id') settlementId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.approve(tenantDbId, settlementId, user.userId);
  }

  @Post(':settlement_id/pay')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Mark settlement as paid' })
  async markPaid(@CurrentUser() user: any, @Param('settlement_id') settlementId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.markPaid(tenantDbId, settlementId);
  }

  @Post(':settlement_id/void')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Void settlement' })
  async voidSettlement(@CurrentUser() user: any, @Param('settlement_id') settlementId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.voidSettlement(tenantDbId, settlementId);
  }

  @Put(':settlement_id/notes')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update settlement notes' })
  async updateNotes(
    @CurrentUser() user: any,
    @Param('settlement_id') settlementId: string,
    @Body() dto: UpdateNotesDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.updateNotes(tenantDbId, settlementId, dto.notes);
  }

  // --- PDF endpoints ---

  @Get(':settlement_id/pdf')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Download settlement PDF' })
  async downloadPdf(@CurrentUser() user: any, @Param('settlement_id') settlementId: string, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);
    const settlement = await this.settlementsService.findOne(tenantDbId, settlementId);
    const buffer = await this.pdfService.generatePdf(tenantDbId, settlementId);
    const safeFilename = settlement.settlementNumber.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFilename}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':settlement_id/pdf/preview')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Preview settlement PDF inline' })
  async previewPdf(@CurrentUser() user: any, @Param('settlement_id') settlementId: string, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);
    const buffer = await this.pdfService.generatePdf(tenantDbId, settlementId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // --- Batch endpoints ---

  @Post('preview-batch')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Preview batch calculation — driver eligibility + estimated pay',
  })
  async previewBatch(@CurrentUser() user: any, @Body() dto: PreviewBatchDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.previewBatch(tenantDbId, dto);
  }

  @Post('batch-calculate')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Calculate settlements for multiple drivers' })
  async batchCalculate(@CurrentUser() user: any, @Body() dto: BatchCalculateDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.batchCalculate(tenantDbId, dto);
  }

  @Post('batch-approve')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Approve multiple settlements' })
  async batchApprove(@CurrentUser() user: any, @Body() dto: BatchSettlementActionDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.batchApprove(tenantDbId, dto.settlementIds, user.userId);
  }

  @Post('batch-pay')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Mark multiple settlements as paid' })
  async batchPay(@CurrentUser() user: any, @Body() dto: BatchSettlementActionDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.batchPay(tenantDbId, dto.settlementIds);
  }

  @Post('batch-void')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Void multiple settlements' })
  async batchVoid(@CurrentUser() user: any, @Body() dto: BatchSettlementActionDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.settlementsService.batchVoid(tenantDbId, dto.settlementIds);
  }

  @Post('batch-pdf')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Download multiple settlement PDFs as ZIP' })
  async batchDownloadPdf(@CurrentUser() user: any, @Body() dto: BatchSettlementActionDto, @Res() res: Response) {
    const tenantDbId = await this.getTenantDbId(user);

    // Collect PDFs first, then stream the archive
    const pdfEntries: Array<{ filename: string; buffer: Buffer }> = [];
    for (const settlementId of dto.settlementIds) {
      try {
        const buffer = await this.pdfService.generatePdf(tenantDbId, settlementId);
        const settlement = await this.settlementsService.findOne(tenantDbId, settlementId);
        const safeFilename = settlement.settlementNumber.replace(/[^a-zA-Z0-9._-]/g, '_');
        pdfEntries.push({ filename: `${safeFilename}.pdf`, buffer });
      } catch {
        // Skip failed PDFs
      }
    }

    if (pdfEntries.length === 0) {
      res.status(400).json({
        message: 'No PDFs could be generated for the selected settlements',
      });
      return;
    }

    const archiver = (await import('archiver')).default;
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="settlements-${Date.now()}.zip"`,
    });

    archive.pipe(res);
    for (const entry of pdfEntries) {
      archive.append(entry.buffer, { name: entry.filename });
    }
    await archive.finalize();
  }
}
