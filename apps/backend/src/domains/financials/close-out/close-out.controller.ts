import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { CloseOutService } from './close-out.service';
import { BillingReadinessService } from './billing-readiness.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

class ApproveForBillingDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  overrideReason?: string;
}

class SendBackDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;
}

@Controller('close-out')
export class CloseOutController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly closeOutService: CloseOutService,
    private readonly readinessService: BillingReadinessService,
  ) {
    super(prisma);
  }

  @Get('summary')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async getSummary(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.closeOutService.getSummary(tenantDbId);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async list(
    @CurrentUser() user: any,
    @Query('billingStatus') billingStatus?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.closeOutService.list(tenantDbId, {
      billingStatus,
      search,
      dateFrom,
      dateTo,
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
      offset: offset ? parseInt(offset, 10) || undefined : undefined,
    });
  }

  @Get(':loadId/readiness')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async getReadiness(@CurrentUser() user: any, @Param('loadId') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.readinessService.evaluate(loadId, tenantDbId);
  }

  @Post(':loadId/approve')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async approveForBilling(
    @CurrentUser() user: any,
    @Param('loadId') loadId: string,
    @Body() body?: ApproveForBillingDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    // Resolve internal numeric user ID for billingOverride FK
    const dbUser = await this.prisma.user.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    return this.closeOutService.approveForBilling(tenantDbId, loadId, dbUser?.id, body?.overrideReason);
  }

  @Post(':loadId/send-back')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  async sendBack(@CurrentUser() user: any, @Param('loadId') loadId: string, @Body() body: SendBackDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const dbUser = await this.prisma.user.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    return this.closeOutService.sendBack(tenantDbId, loadId, body.reason, dbUser?.id);
  }
}
