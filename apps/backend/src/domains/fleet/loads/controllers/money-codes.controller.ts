import { Controller, Post, Patch, Get, Param, Body, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { MoneyCodeService } from '../services/money-code.service';
import {
  CreateMoneyCodeDto,
  ApproveMoneyCodeDto,
  DenyMoneyCodeDto,
  UseMoneyCodeDto,
  IssueMoneyCodeDto,
} from '../dto/money-code.dto';

@ApiTags('Money Codes')
@ApiBearerAuth()
@Controller('loads/:loadId/money-codes')
export class MoneyCodesController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly moneyCodeService: MoneyCodeService,
  ) {
    super(prisma);
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.DRIVER)
  @ApiOperation({ summary: 'Request or issue money code' })
  @ApiParam({ name: 'loadId' })
  async create(@Param('loadId') loadId: string, @Body() dto: CreateMoneyCodeDto, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId },
      select: { id: true, driverId: true },
    });
    if (!load) throw new NotFoundException('Load not found');

    let driverId: number;
    if (user.role === UserRole.DRIVER) {
      if (load.driverId !== user.driverDbId) {
        throw new ForbiddenException('You are not assigned to this load');
      }
      driverId = user.driverDbId;
    } else {
      if (!load.driverId) throw new NotFoundException('No driver assigned to this load');
      driverId = load.driverId;
    }

    return this.moneyCodeService.create({
      tenantId,
      loadId: load.id,
      driverId,
      stopId: dto.stopId,
      requestedCents: dto.requestedCents,
      method: dto.method,
      driverNote: dto.driverNote,
    });
  }

  @Post('issue')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Proactively issue money code to driver (no request needed)',
  })
  @ApiParam({ name: 'loadId' })
  async issue(@Param('loadId') loadId: string, @Body() dto: IssueMoneyCodeDto, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId },
      select: { id: true, driverId: true },
    });
    if (!load) throw new NotFoundException('Load not found');
    if (!load.driverId) throw new NotFoundException('No driver assigned to this load');

    return this.moneyCodeService.issueProactively({
      tenantId,
      loadId: load.id,
      driverId: load.driverId,
      stopId: dto.stopId,
      code: dto.code,
      amountCents: dto.amountCents,
      method: dto.method,
      dispatcherNote: dto.dispatcherNote,
      issuedBy: user.dbId,
      expiresInHours: dto.expiresInHours,
    });
  }

  @Get('insights')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get Sally insights for lumper request' })
  @ApiParam({ name: 'loadId' })
  async insights(@Param('loadId') loadId: string, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException('Load not found');
    return this.moneyCodeService.getLumperInsights(load.id, tenantId);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.DRIVER)
  @ApiOperation({ summary: 'List money codes for a load' })
  @ApiParam({ name: 'loadId' })
  async list(@Param('loadId') loadId: string, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId },
      select: { id: true },
    });
    if (!load) throw new NotFoundException('Load not found');
    return this.moneyCodeService.getByLoad(load.id, tenantId);
  }

  @Patch(':moneyCodeId/approve')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve money code and send to driver' })
  @ApiParam({ name: 'loadId' })
  @ApiParam({ name: 'moneyCodeId' })
  async approve(@Param('moneyCodeId') moneyCodeId: string, @Body() dto: ApproveMoneyCodeDto, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.moneyCodeService.approve({
      moneyCodeId,
      tenantId,
      approvedBy: user.dbId,
      code: dto.code,
      amountCents: dto.amountCents,
      dispatcherNote: dto.dispatcherNote,
      expiresInHours: dto.expiresInHours,
    });
  }

  @Patch(':moneyCodeId/deny')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Deny money code request' })
  @ApiParam({ name: 'loadId' })
  @ApiParam({ name: 'moneyCodeId' })
  async deny(@Param('moneyCodeId') moneyCodeId: string, @Body() dto: DenyMoneyCodeDto, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.moneyCodeService.deny({
      moneyCodeId,
      tenantId,
      deniedBy: user.dbId,
      dispatcherNote: dto.dispatcherNote,
    });
  }

  @Patch(':moneyCodeId/use')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Mark money code as used (receipt uploaded)' })
  @ApiParam({ name: 'loadId' })
  @ApiParam({ name: 'moneyCodeId' })
  async markUsed(@Param('moneyCodeId') moneyCodeId: string, @Body() dto: UseMoneyCodeDto, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.moneyCodeService.markUsed({
      moneyCodeId,
      tenantId,
      actualAmountCents: dto.actualAmountCents,
      receiptDocumentId: dto.receiptDocumentId,
    });
  }

  @Patch(':moneyCodeId/cancel')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.DRIVER)
  @ApiOperation({ summary: 'Cancel money code' })
  @ApiParam({ name: 'loadId' })
  @ApiParam({ name: 'moneyCodeId' })
  async cancel(@Param('moneyCodeId') moneyCodeId: string, @CurrentUser() user: any) {
    const tenantId = await this.getTenantDbId(user);
    return this.moneyCodeService.cancel(moneyCodeId, tenantId);
  }
}
