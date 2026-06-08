import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { DriverConversationsService } from '../../drivers/services/driver-conversations.service';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

/**
 * Load-scoped messaging — the load detail sheet's "message the driver" view.
 *
 * Conversations are keyed to the DRIVER (one persistent thread per driver);
 * this controller is a thin load-scoped delegate over `DriverConversationsService`.
 * Sending from a load tags the message with that load; reading from a load
 * shows only that load's messages within the driver's thread. The URL stays
 * `/loads/:id/messages` so the load sheet / Activity tab / driver app are
 * unchanged — only the storage model moved.
 *
 * A load with no assigned driver has nobody to message — those endpoints
 * return 400 rather than inventing a driverless conversation.
 */
@ApiTags('Load Messages')
@ApiBearerAuth()
@Controller('loads')
export class LoadMessagesController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly conversations: DriverConversationsService,
  ) {
    super(prisma);
  }

  /**
   * Resolve a load to the driver whose thread this load's messages belong in,
   * enforcing access. For a plain load that's the assigned driver; for a relay
   * load it's the leg driver — when a leg driver messages, it's their own leg
   * they're on, so the thread is keyed to them.
   *
   * Throws 404 (no load), 400 (load has no driver to message), or 403 (a
   * driver reaching a thread that isn't theirs).
   */
  private async resolveLoadDriver(loadId: string, tenantDbId: number, user: any): Promise<string> {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber: loadId, tenantId: tenantDbId },
      select: {
        isRelay: true,
        driver: { select: { driverId: true } },
        legs: { select: { driver: { select: { driverId: true } } } },
      },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadId}`);

    // Relay load + a driver requester → resolve to that driver's own leg, so
    // a leg driver messages within their own thread rather than the primary's.
    if (load.isRelay && user.role === UserRole.DRIVER) {
      const ownLeg = load.legs.find((leg) => leg.driver && leg.driver.driverId === user.driverId);
      if (ownLeg?.driver) return ownLeg.driver.driverId;
      throw new ForbiddenException('You are not assigned to any leg of this relay load');
    }

    // Plain load (or a dispatcher on a relay) → the load's primary driver.
    if (!load.driver) {
      throw new BadRequestException('Assign a driver to this load before messaging.');
    }
    // A non-relay driver requester may only touch their own thread.
    this.assertDriverScopedAccess(user, load.driver.driverId);
    return load.driver.driverId;
  }

  @Get(':load_id/messages')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Messages for this load (the driver thread, filtered to the load)' })
  async getMessages(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const driverId = await this.resolveLoadDriver(loadId, tenantDbId, user);
    return this.conversations.getThread(tenantDbId, driverId, loadId);
  }

  @Get(':load_id/messages/unread-count')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Unread count for the current user role in this load thread' })
  async getUnreadCount(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const driverId = await this.resolveLoadDriver(loadId, tenantDbId, user);
    const viewer = user.role === UserRole.DRIVER ? 'driver' : 'dispatcher';
    const count = await this.conversations.unreadForDriver(tenantDbId, driverId, viewer);
    return { count };
  }

  @Post(':load_id/messages')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Send a message to this load’s driver (tagged with the load)' })
  async sendMessage(@CurrentUser() user: any, @Param('load_id') loadId: string, @Body() body: SendMessageDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const driverId = await this.resolveLoadDriver(loadId, tenantDbId, user);
    const role = user.role === UserRole.DRIVER ? 'driver' : 'dispatcher';
    // Explicit loadId so the message is tagged with this load, not the
    // driver's (possibly different) current active load.
    return this.conversations.sendMessage(
      tenantDbId,
      driverId,
      { content: body.content, loadNumber: loadId },
      role,
      user.userId,
    );
  }

  @Patch(':load_id/messages/read')
  @Roles(UserRole.DRIVER, UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Mark this load’s driver thread read by the current role' })
  async markRead(@CurrentUser() user: any, @Param('load_id') loadId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const driverId = await this.resolveLoadDriver(loadId, tenantDbId, user);
    const viewer = user.role === UserRole.DRIVER ? 'driver' : 'dispatcher';
    await this.conversations.markRead(tenantDbId, driverId, viewer);
    return { success: true };
  }

  @Post(':load_id/messages/:message_id/delivered')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Mark a dispatcher message as delivered to the driver device' })
  async markDelivered(
    @CurrentUser() user: any,
    @Param('load_id') loadId: string,
    @Param('message_id') messageId: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    // Access check — the driver must own this load's thread.
    await this.resolveLoadDriver(loadId, tenantDbId, user);

    const message = await this.prisma.conversationMessage.findUnique({
      where: { messageId },
      select: { role: true },
    });
    // Only dispatcher messages get a delivered receipt; a driver's own
    // messages and a missing id are silent no-ops.
    if (!message || message.role === 'driver') return { success: true };

    await this.prisma.conversationMessage.update({
      where: { messageId },
      data: { action: { deliveredAt: new Date().toISOString() } },
    });
    return { success: true };
  }
}
