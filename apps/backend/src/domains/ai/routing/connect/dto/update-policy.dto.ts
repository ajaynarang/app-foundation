import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { AiRetentionPolicy, UpdateAiPolicyInput } from '@app/shared-types';

const POLICIES: readonly AiRetentionPolicy[] = ['STANDARD', 'ZDR'];

/** `PATCH /ai-settings/policy`. Mirrors `UpdateAiPolicyInputSchema`. */
export class UpdateAiPolicyDto implements UpdateAiPolicyInput {
  @ApiProperty({
    enum: POLICIES,
    description: '`ZDR` requires zero data retention: AI calls run only on routes that keep nothing, or are refused.',
  })
  @IsIn(POLICIES)
  policy!: AiRetentionPolicy;
}
