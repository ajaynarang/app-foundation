import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  WEBHOOK_SECRET_OVERLAP_DEFAULT_HOURS,
  WEBHOOK_SECRET_OVERLAP_MAX_HOURS,
  type RotateWebhookSecretInput,
} from '@app/shared-types';

export class RotateWebhookSecretDto implements RotateWebhookSecretInput {
  @ApiProperty({
    required: false,
    default: WEBHOOK_SECRET_OVERLAP_DEFAULT_HOURS,
    minimum: 0,
    maximum: WEBHOOK_SECRET_OVERLAP_MAX_HOURS,
    description:
      'Hours the previous secret keeps signing alongside the new one, so receivers can switch without dropping deliveries. 0 retires it at once.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(WEBHOOK_SECRET_OVERLAP_MAX_HOURS)
  overlapHours?: number;
}
