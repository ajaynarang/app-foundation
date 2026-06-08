import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { IsString, MinLength, MaxLength, IsOptional, ValidateIf } from 'class-validator';
import type { SendDriverMessageInput } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../../../auth/decorators/require-feature.decorator';
import { DriverConversationsService } from '../services/driver-conversations.service';

class SendDriverMessageDto implements SendDriverMessageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  // null = a general message; undefined = default to the active load;
  // string = tag to that load. ValidateIf skips @IsString for an explicit null.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  loadNumber?: string | null;
}

/**
 * Driver-keyed messaging — the Tower Messages inbox surface.
 *
 * `command_center`-gated: this is the Tower's messaging tab. Dispatchers see
 * every driver conversation in the tenant; the thread + send endpoints also
 * let a driver post into their own thread (the driver app reuses them),
 * guarded by `assertDriverScopedAccess`.
 */
@ApiTags('Driver Messages')
@ApiBearerAuth()
@Controller('messages')
export class DriverMessagesController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly conversations: DriverConversationsService,
  ) {
    super(prisma);
  }

  @Get('conversations')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @RequireFeature('command_center')
  @ApiOperation({ summary: 'Driver conversation triage list for the Tower Messages tab' })
  async list(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.conversations.listConversations(tenantDbId);
  }

  @Get('conversations/:driver_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Message thread for one driver' })
  @ApiParam({ name: 'driver_id' })
  async thread(@CurrentUser() user: any, @Param('driver_id') driverId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    // A driver may only read their own thread; no-op for dispatcher/admin/owner.
    this.assertDriverScopedAccess(user, driverId);
    return this.conversations.getThread(tenantDbId, driverId);
  }

  @Post('conversations/:driver_id')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Send a message into a driver thread' })
  @ApiParam({ name: 'driver_id' })
  async send(@CurrentUser() user: any, @Param('driver_id') driverId: string, @Body() body: SendDriverMessageDto) {
    const tenantDbId = await this.getTenantDbId(user);
    this.assertDriverScopedAccess(user, driverId);
    const role = user.role === UserRole.DRIVER ? 'driver' : 'dispatcher';
    return this.conversations.sendMessage(tenantDbId, driverId, body, role, user.userId);
  }

  @Patch('conversations/:driver_id/read')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'Mark a driver thread read by the current role' })
  @ApiParam({ name: 'driver_id' })
  async markRead(@CurrentUser() user: any, @Param('driver_id') driverId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    // A driver may only mark their own thread; no-op for dispatcher/admin/owner.
    this.assertDriverScopedAccess(user, driverId);
    const viewer = user.role === UserRole.DRIVER ? 'driver' : 'dispatcher';
    await this.conversations.markRead(tenantDbId, driverId, viewer);
    return { success: true };
  }
}
