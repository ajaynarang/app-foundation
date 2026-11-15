import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const PREFERENCE_RESET_SCOPES = ['user'] as const;

/** POST /settings/reset — which preferences go back to defaults. */
export class ResetPreferencesDto {
  @ApiProperty({ enum: PREFERENCE_RESET_SCOPES })
  @IsIn(PREFERENCE_RESET_SCOPES)
  scope!: (typeof PREFERENCE_RESET_SCOPES)[number];
}
