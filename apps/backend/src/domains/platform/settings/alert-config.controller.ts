import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AlertConfigService } from './alert-config.service';
import { UpdateAlertConfigDto } from './dto/alert-config.dto';

@ApiTags('Alert Configuration')
@Controller('settings/alerts')
export class AlertConfigController {
  constructor(private readonly service: AlertConfigService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Get tenant alert configuration' })
  async getConfig(@CurrentUser() user: any) {
    return this.service.getConfig(user.tenantDbId);
  }

  @Put()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update tenant alert configuration' })
  async updateConfig(@CurrentUser() user: any, @Body() dto: UpdateAlertConfigDto) {
    return this.service.updateConfig(user.tenantDbId, dto);
  }
}
