import { ApiProperty } from '@nestjs/swagger';
import type { ResolveEpisodeRequest } from '@app/shared-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /desk/episodes/:id/resolve body.
 *
 * Mirrors `ResolveEpisodeRequestSchema` in @app/shared-types. Using
 * class-validator (project convention — no `createZodDto` in this codebase).
 *
 * The note is optional by design — the human dealing with the escalation is
 * the signal that matters; mandating a note just adds friction.
 */
export class ResolveEpisodeDto implements ResolveEpisodeRequest {
  @ApiProperty({
    required: false,
    description: 'Optional operator note — appended to the episode outcome so Handled history records why it cleared.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
