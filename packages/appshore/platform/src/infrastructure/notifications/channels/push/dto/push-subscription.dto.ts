import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

const MAX_ENDPOINT = 2048;
const MAX_KEY = 512;

/** The subscription's encryption keys (Web Push, RFC 8291). */
export class PushSubscriptionKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_KEY)
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_KEY)
  auth!: string;
}

/** A browser `PushSubscription.toJSON()`: `endpoint`, `expirationTime`, `keys`. */
export class PushSubscriptionJsonDto {
  @ApiProperty({ description: 'The push service URL for this browser' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ENDPOINT)
  endpoint!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Epoch ms, or null. Sent by the browser, not stored' })
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @ApiPropertyOptional({ description: 'The browser, for the device list' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_KEY)
  userAgent?: string;
}

/** POST /push/subscribe */
export class SubscribePushDto {
  @ApiProperty({ type: PushSubscriptionJsonDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionJsonDto)
  subscription!: PushSubscriptionJsonDto;
}

/** DELETE /push/unsubscribe */
export class UnsubscribePushDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ENDPOINT)
  endpoint!: string;
}
