import { IsOptional, IsEnum } from 'class-validator';
import { NotificationType, NotificationStatus } from '@appshore/db';

export class NotificationFiltersDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}
