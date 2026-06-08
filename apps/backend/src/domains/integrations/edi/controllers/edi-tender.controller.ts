import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { TenderService } from '../tender/tender.service';
import { TenderRulesService } from '../tender/tender-rules.service';
import { EDIMessageService } from '../services/edi-message.service';

class RespondToTenderDto {
  @IsString()
  response: 'accept' | 'decline' | 'counter';

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  counterRateCents?: number;
}

class CreateRuleDto {
  @IsString()
  name: string;

  @IsObject()
  conditions: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  tradingPartnerId?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  priority?: number;
}

@ApiTags('EDI')
@Controller('edi/tenders')
@RequireFeature('edi_integration')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class EDITenderController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly tenderService: TenderService,
    private readonly rulesService: TenderRulesService,
    private readonly messageService: EDIMessageService,
  ) {
    super(prisma);
  }

  @Get()
  @ApiOperation({ summary: 'List pending tenders' })
  async listPendingTenders(@CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.messageService.findPendingTenders(tenantId);
  }

  @Post(':loadId/respond')
  @ApiOperation({ summary: 'Accept, decline, or counter a tender' })
  async respondToTender(
    @CurrentUser() user: any,
    @Param('loadId', ParseIntPipe) loadId: number,
    @Body() body: RespondToTenderDto,
  ) {
    const tenantId = await this.getTenantDbId(user);
    return this.tenderService.respondToTender(tenantId, loadId, body.response as any, body.counterRateCents);
  }

  @Get('rules')
  @ApiOperation({ summary: 'List auto-accept rules' })
  async listRules(@CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.rulesService.listRules(tenantId);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create auto-accept rule' })
  async createRule(@CurrentUser() user: any, @Body() body: CreateRuleDto) {
    const tenantId = await this.getTenantDbId(user);
    return this.rulesService.createRule(tenantId, body);
  }

  @Patch('rules/:ruleId/approve')
  @ApiOperation({ summary: 'Approve a Sally-suggested rule' })
  async approveRule(@CurrentUser() user: any, @Param('ruleId', ParseIntPipe) ruleId: number) {
    const tenantId = await this.getTenantDbId(user);
    return this.rulesService.approveRule(tenantId, ruleId, user.id);
  }
}
