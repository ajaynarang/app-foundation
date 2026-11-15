import { IsOptional, IsEnum, IsString, Matches, MaxLength } from 'class-validator';
import { NotificationStatus } from '@appshore/db';
import { NOTIFICATION_TYPE_MAX_LENGTH, type NotificationType } from '@app/shared-types';

export class NotificationFiltersDto {
  /** A platform or app notification type: a string from the registry, not a Prisma enum. */
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_TYPE_MAX_LENGTH)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}
