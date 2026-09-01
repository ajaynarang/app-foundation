import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicePlatform, UserRole } from '@appshore/db';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../database/prisma.service';
import { FcmService } from './fcm.service';
import { RegisterDeviceDto, RemoveDeviceDto, DevicePlatformInput } from './dto/register-device.dto';

const PLATFORM_BY_INPUT: Record<DevicePlatformInput, DevicePlatform> = {
  ios: DevicePlatform.IOS,
  android: DevicePlatform.ANDROID,
};

/**
 * Mobile FCM device-token registry. The mobile app calls POST after login /
 * token refresh and DELETE on logout. Web push registers through the
 * foundation's `POST /push/subscribe` instead (VAPID subscription shape).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/devices')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class NotificationDevicesController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly fcmService: FcmService,
  ) {
    super(prisma);
  }

  @Post()
  @ApiOperation({ summary: 'Register this device for mobile push (FCM token)' })
  async register(@CurrentUser() user: any, @Body() dto: RegisterDeviceDto) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.fcmService.registerDevice(user.dbId, tenantDbId, dto.token, PLATFORM_BY_INPUT[dto.platform]);
    return { message: 'Device registered for push notifications' };
  }

  @Delete()
  @ApiOperation({ summary: 'Deregister this device from mobile push' })
  async remove(@CurrentUser() user: any, @Body() dto: RemoveDeviceDto) {
    await this.fcmService.removeDevice(user.dbId, dto.token);
    return { message: 'Device removed' };
  }
}
