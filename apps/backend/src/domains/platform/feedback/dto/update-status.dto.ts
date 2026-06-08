import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FeedbackStatusEnum, type FeedbackStatus } from '@sally/shared-types';

const FEEDBACK_STATUSES = FeedbackStatusEnum.options;

export class UpdateStatusDto {
  @ApiProperty({ enum: FEEDBACK_STATUSES, description: 'Target status for the feedback' })
  @IsIn(FEEDBACK_STATUSES)
  status: FeedbackStatus;
}
