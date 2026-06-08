import { Controller, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { DriverUnavailabilityService } from './driver-unavailability.service';
import { CreateDriverUnavailabilityDto, UpdateDriverUnavailabilityDto } from './driver-unavailability.dto';

@ApiTags('Driver Unavailability')
@ApiBearerAuth()
@Controller('driver-unavailability')
@RequireFeature('horizon')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class DriverUnavailabilityController {
  constructor(private readonly service: DriverUnavailabilityService) {}

  @Post()
  @ApiOperation({ summary: 'Mark driver as unavailable for a date range' })
  async create(@CurrentUser() user: any, @Body() dto: CreateDriverUnavailabilityDto) {
    return this.service.create(user.tenantDbId, user.dbId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update driver unavailability' })
  @ApiParam({ name: 'id' })
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDriverUnavailabilityDto,
  ) {
    return this.service.update(id, user.tenantDbId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete driver unavailability' })
  @ApiParam({ name: 'id' })
  async delete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    await this.service.delete(id, user.tenantDbId);
    return { message: 'Unavailability deleted' };
  }
}
