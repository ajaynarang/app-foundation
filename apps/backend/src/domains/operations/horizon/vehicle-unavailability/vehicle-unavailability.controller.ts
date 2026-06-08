import { Controller, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { VehicleUnavailabilityService } from './vehicle-unavailability.service';
import { CreateVehicleUnavailabilityDto, UpdateVehicleUnavailabilityDto } from './vehicle-unavailability.dto';

@ApiTags('Vehicle Unavailability')
@ApiBearerAuth()
@Controller('vehicle-unavailability')
@RequireFeature('horizon')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class VehicleUnavailabilityController {
  constructor(private readonly service: VehicleUnavailabilityService) {}

  @Post()
  @ApiOperation({ summary: 'Mark vehicle as unavailable for a date range' })
  async create(@CurrentUser() user: any, @Body() dto: CreateVehicleUnavailabilityDto) {
    return this.service.create(user.tenantDbId, user.dbId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vehicle unavailability' })
  @ApiParam({ name: 'id' })
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleUnavailabilityDto,
  ) {
    return this.service.update(id, user.tenantDbId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete vehicle unavailability' })
  @ApiParam({ name: 'id' })
  async delete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    await this.service.delete(id, user.tenantDbId);
    return { message: 'Unavailability deleted' };
  }
}
