import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { type SallyCapabilities, SallyUserModeSchema } from '@sally/shared-types';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { CapabilityRegistryService } from './capability-registry.service';

@ApiTags('Sally AI Capabilities')
@ApiBearerAuth()
@Controller('sally/capabilities')
export class CapabilityRegistryController {
  constructor(private readonly registry: CapabilityRegistryService) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.DRIVER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.CUSTOMER)
  @ApiOperation({
    summary: 'List the things Sally can do for the current user',
    description:
      "Powers the Sally command palette and capability card. Mode is normally derived from the user's role; pass ?mode= to force a specific set (e.g. show prospect set on a marketing surface).",
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: SallyUserModeSchema.options,
  })
  list(@CurrentUser() user: { role?: UserRole }, @Query('mode') mode?: string): SallyCapabilities {
    return this.registry.resolve({ requestedMode: mode, userRole: user.role });
  }
}
