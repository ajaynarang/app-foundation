import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Wire values are lowercase (mobile contract); the service maps to DevicePlatform. */
export const DEVICE_PLATFORMS = ['ios', 'android'] as const;
export type DevicePlatformInput = (typeof DEVICE_PLATFORMS)[number];

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token for this device', maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS, example: 'android' })
  @IsIn(DEVICE_PLATFORMS)
  platform: DevicePlatformInput;
}

export class RemoveDeviceDto {
  @ApiProperty({ description: 'FCM registration token to deregister', maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}
