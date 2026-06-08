import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ShieldService } from './services/shield.service';
import { TriggerAuditDto } from './dto/trigger-audit.dto';
import { CreateCustomRuleDto, UpdateCustomRuleDto } from './dto/custom-rule.dto';
import { BulkResolveDto } from './dto/bulk-resolve.dto';

@ApiTags('Shield')
@Controller('shield')
@RequireFeature('shield')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class ShieldController {
  private readonly logger = new Logger(ShieldController.name);

  constructor(
    private readonly shieldService: ShieldService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get latest Shield audit results for the current tenant',
  })
  async getLatestAudit(@CurrentUser() user: any) {
    const tenantId = user.tenantDbId;

    const [inProgressAudit, completedAudit, lastFailedAudit] = await Promise.all([
      this.shieldService.getInProgressAudit(tenantId),
      this.shieldService.getLatestAudit(tenantId),
      this.shieldService.getLastFailedAudit(tenantId),
    ]);

    const nextScheduledAt = this.shieldService.getNextScheduledAuditTime().toISOString();

    if (!completedAudit && !inProgressAudit && !lastFailedAudit) {
      return {
        hasAudit: false,
        inProgress: false,
        hasFailed: false,
        nextScheduledAt,
        message: 'No completed audits yet. Run your first audit to get started.',
      };
    }

    return {
      hasAudit: !!completedAudit,
      inProgress: !!inProgressAudit,
      // Only surface failure if there's no completed audit to fall back on
      hasFailed: !!lastFailedAudit && !completedAudit,
      nextScheduledAt,
      inProgressAudit: inProgressAudit
        ? {
            id: inProgressAudit.id,
            status: inProgressAudit.status,
            scope: inProgressAudit.scope,
            createdAt: inProgressAudit.createdAt,
          }
        : undefined,
      audit: completedAudit ?? undefined,
    };
  }

  @Get('score')
  @ApiOperation({ summary: 'Get current Shield scores (lightweight)' })
  async getScores(@CurrentUser() user: any) {
    return this.shieldService.getLatestScores(user.tenantDbId);
  }

  @Post('audit')
  @ApiOperation({ summary: 'Trigger a new Shield audit' })
  async triggerAudit(@Body() dto: TriggerAuditDto, @CurrentUser() user: any) {
    // Read org defaults for AI and audit period, allow per-request override
    const settings = await this.prisma.fleetOperationsSettings.findUnique({
      where: { tenantId: user.tenantDbId },
      select: {
        shieldAiEnabled: true,
        shieldCustomRulesEnabled: true,
        shieldAuditPeriodDays: true,
      },
    });

    const result = await this.shieldService.triggerAudit({
      tenantId: user.tenantDbId,
      scope: (dto.scope ?? 'FULL') as any,
      triggeredBy: 'MANUAL',
      triggeredById: user.dbId,
      includeAi: dto.includeAi ?? settings?.shieldAiEnabled ?? true,
      includeCustomRules: dto.includeCustomRules ?? settings?.shieldCustomRulesEnabled ?? true,
      auditPeriodDays: dto.auditPeriodDays ?? settings?.shieldAuditPeriodDays ?? 30,
    });
    return result;
  }

  @Post('audit/:id/cancel')
  @ApiOperation({ summary: 'Cancel an in-progress Shield audit' })
  @ApiParam({ name: 'id', description: 'Audit ID' })
  async cancelAudit(@Param('id') auditId: string, @CurrentUser() user: any) {
    return this.shieldService.cancelAudit(user.tenantDbId, auditId);
  }

  @Get('audits')
  @ApiOperation({ summary: 'Get audit history (paginated)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Filter audits from this date (ISO 8601, inclusive)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Filter audits up to this date (ISO 8601, inclusive, end of day)',
  })
  async getAuditHistory(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.shieldService.getAuditHistory(
      user.tenantDbId,
      Math.min(Math.max(isNaN(parsedLimit) ? 20 : parsedLimit, 1), 100),
      Math.max(isNaN(parsedOffset) ? 0 : parsedOffset, 0),
      dateFrom,
      dateTo,
    );
  }

  // PDF Export — must be before audits/:id to avoid route shadowing
  @Get('audits/:id/export')
  @ApiOperation({ summary: 'Export audit as PDF' })
  @ApiParam({ name: 'id', description: 'Audit ID' })
  async exportAuditPdf(@Param('id') auditId: string, @CurrentUser() user: any, @Res() res: Response) {
    const pdf = await this.shieldService.generateAuditPdf(user.tenantDbId, auditId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="shield-audit-${auditId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  }

  @Get('audits/:id')
  @ApiOperation({ summary: 'Get specific audit with findings' })
  @ApiParam({ name: 'id', description: 'Audit ID' })
  async getAuditById(@Param('id') auditId: string, @CurrentUser() user: any) {
    const audit = await this.shieldService.getAuditById(user.tenantDbId, auditId);
    if (!audit) throw new NotFoundException('Audit not found');
    return audit;
  }

  @Get('findings')
  @ApiOperation({ summary: 'Get all findings (filterable)' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'resolved', required: false, type: Boolean })
  async getFindings(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('resolved') resolved?: string,
  ) {
    const validCategories = ['HOS', 'DRIVERS', 'VEHICLES', 'LOADS'];
    const validSeverities = ['CRITICAL', 'WARNING', 'INFO'];

    if (category && !validCategories.includes(category)) {
      throw new BadRequestException(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }
    if (severity && !validSeverities.includes(severity)) {
      throw new BadRequestException(`Invalid severity. Must be one of: ${validSeverities.join(', ')}`);
    }

    return this.shieldService.getFindings(user.tenantDbId, {
      category,
      severity,
      isResolved: resolved != null ? resolved === 'true' : undefined,
    });
  }

  // Bulk resolve — must be before findings/:id/resolve to avoid route shadowing
  @Patch('findings/bulk-resolve')
  @ApiOperation({ summary: 'Bulk resolve findings' })
  async bulkResolveFindings(@Body() dto: BulkResolveDto, @CurrentUser() user: any) {
    const result = await this.shieldService.bulkResolveFindings(user.tenantDbId, dto.findingIds, user.dbId);
    return { resolved: result.count };
  }

  @Patch('findings/:id/resolve')
  @ApiOperation({ summary: 'Mark a finding as resolved' })
  @ApiParam({ name: 'id', description: 'Finding ID' })
  async resolveFinding(@Param('id') findingId: string, @CurrentUser() user: any) {
    return this.shieldService.resolveFinding(user.tenantDbId, findingId, user.dbId);
  }

  // Custom Rules
  @Get('rules')
  @ApiOperation({ summary: 'List custom compliance rules' })
  async getCustomRules(@CurrentUser() user: any) {
    return this.shieldService.getCustomRules(user.tenantDbId);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create custom compliance rule' })
  async createCustomRule(@Body() dto: CreateCustomRuleDto, @CurrentUser() user: any) {
    return this.shieldService.createCustomRule(user.tenantDbId, dto.rule, user.dbId);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update custom compliance rule' })
  @ApiParam({ name: 'id', description: 'Rule ID' })
  async updateCustomRule(@Param('id') ruleId: string, @Body() dto: UpdateCustomRuleDto, @CurrentUser() user: any) {
    return this.shieldService.updateCustomRule(user.tenantDbId, ruleId, dto);
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete custom compliance rule' })
  @ApiParam({ name: 'id', description: 'Rule ID' })
  async deleteCustomRule(@Param('id') ruleId: string, @CurrentUser() user: any) {
    await this.shieldService.deleteCustomRule(user.tenantDbId, ruleId);
    return { deleted: true };
  }
}
