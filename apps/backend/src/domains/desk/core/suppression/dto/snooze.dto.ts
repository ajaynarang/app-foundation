import { ApiProperty } from '@nestjs/swagger';
import type { SnoozeDuration } from '@sally/shared-types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /desk/episodes/:id/snooze body.
 *
 * Mirrors `SnoozeEpisodeRequestSchema` in @sally/shared-types. Using
 * class-validator (project convention — no `createZodDto` in this codebase).
 *
 * Canned durations only (design spec D16): 1d / 3d / 1w / 1mo / forever.
 */
const SNOOZE_DURATIONS: readonly SnoozeDuration[] = ['1d', '3d', '1w', '1mo', 'forever'];

export class SnoozeEpisodeDto {
  @ApiProperty({
    enum: SNOOZE_DURATIONS,
    description: 'Canned snooze duration. "forever" maps to suppressUntil=null.',
  })
  @IsIn(SNOOZE_DURATIONS as unknown as string[])
  duration!: SnoozeDuration;

  @ApiProperty({
    required: false,
    description: 'Optional operator note. Stored on the suppression row for audit.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
