import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { HorizonService } from './horizon.service';
import { isValid, parseISO } from 'date-fns';

@ApiTags('Horizon')
@ApiBearerAuth()
@Controller('horizon')
@RequireFeature('horizon')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class HorizonController {
  constructor(private readonly service: HorizonService) {}

  @Get()
  @ApiOperation({ summary: 'Get weekly fleet planning grid for Horizon' })
  @ApiQuery({
    name: 'weekOf',
    required: false,
    description: 'YYYY-MM-DD — Monday of the target week. Defaults to current week.',
  })
  async getHorizon(@CurrentUser() user: any, @Query('weekOf') weekOf?: string) {
    if (weekOf && (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf) || !isValid(parseISO(weekOf)))) {
      throw new BadRequestException('weekOf must be a valid date in YYYY-MM-DD format');
    }
    const effectiveWeekOf = weekOf ?? new Date().toISOString().slice(0, 10);
    return this.service.getHorizon(user.tenantDbId, effectiveWeekOf);
  }
}
