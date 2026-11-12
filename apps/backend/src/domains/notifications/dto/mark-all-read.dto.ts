import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { NotificationCategory } from '@appshore/db';

/** `POST /notifications/mark-all-read` body — `category` narrows it to one category; absent: every unread one. */
export class MarkAllReadDto {
  @ApiPropertyOptional({ enum: NotificationCategory })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;
}
