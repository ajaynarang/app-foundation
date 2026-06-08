import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { EDIPartnerService, CreatePartnerDto, UpdatePartnerDto } from '../services/edi-partner.service';
import { EDIMessageService } from '../services/edi-message.service';

class ListMessagesQueryDto {
  @IsOptional()
  @IsString()
  direction?: string;

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tradingPartnerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

@ApiTags('EDI')
@Controller('edi/settings')
@RequireFeature('edi_integration')
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class EDISettingsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly partnerService: EDIPartnerService,
    private readonly messageService: EDIMessageService,
  ) {
    super(prisma);
  }

  @Get('partners')
  @ApiOperation({ summary: 'List trading partners' })
  async listPartners(@CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.partnerService.listPartners(tenantId);
  }

  @Get('partners/:partnerId')
  @ApiOperation({ summary: 'Get trading partner details' })
  async getPartner(@CurrentUser() user: any, @Param('partnerId', ParseIntPipe) partnerId: number) {
    const tenantId = await this.getTenantDbId(user);
    return this.partnerService.getPartner(tenantId, partnerId);
  }

  @Post('partners')
  @ApiOperation({ summary: 'Add trading partner' })
  async createPartner(@CurrentUser() user: any, @Body() body: CreatePartnerDto) {
    const tenantId = await this.getTenantDbId(user);
    return this.partnerService.createPartner(tenantId, body);
  }

  @Patch('partners/:partnerId')
  @ApiOperation({ summary: 'Update trading partner' })
  async updatePartner(
    @CurrentUser() user: any,
    @Param('partnerId', ParseIntPipe) partnerId: number,
    @Body() body: UpdatePartnerDto,
  ) {
    const tenantId = await this.getTenantDbId(user);
    return this.partnerService.updatePartner(tenantId, partnerId, body);
  }

  @Get('messages')
  @ApiOperation({ summary: 'List EDI message audit log' })
  async listMessages(@CurrentUser() user: any, @Query() params: ListMessagesQueryDto) {
    const tenantId = await this.getTenantDbId(user);
    return this.messageService.listMessages(tenantId, params);
  }
}
