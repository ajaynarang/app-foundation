import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { PayStructureService } from '../services/pay-structure.service';
import { UpsertPayStructureDto } from '../dto';

@ApiTags('Pay Structures')
@ApiBearerAuth()
@Controller('pay-structures')
export class PayStructureController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly payStructureService: PayStructureService,
  ) {
    super(prisma);
  }

  @Get('mine')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Get own pay structure (driver self-service)' })
  async getMyPayStructure(@CurrentUser() user: any) {
    this.assertHasDriverProfile(user);
    const tenantDbId = await this.getTenantDbId(user);
    return this.payStructureService.getByDriverId(tenantDbId, user.driverId);
  }

  @Get(':driver_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get driver pay structure' })
  async getByDriverId(@CurrentUser() user: any, @Param('driver_id') driverId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.payStructureService.getByDriverId(tenantDbId, driverId);
  }

  @Put(':driver_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create or update driver pay structure' })
  async upsert(@CurrentUser() user: any, @Param('driver_id') driverId: string, @Body() dto: UpsertPayStructureDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.payStructureService.upsert(tenantDbId, driverId, dto);
  }
}
