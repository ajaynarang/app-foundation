import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { TrustLevel } from '@app/shared-types';

/**
 * PATCH /desk/responsibilities/:key — all fields optional. At least one
 * must be present; the service re-validates with the Zod schema from
 * shared-types so the two surfaces agree.
 *
 * Supervisor lives on DeskAgent as of 2026-04-23 — use PATCH /desk/agents/:key.
 * Free-form rules previously stored on `notesForSally` now live as
 * operator-authored playbook memories — POST /desk/memories/playbook.
 */
export class UpdateResponsibilityDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, enum: ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'] })
  @IsOptional()
  @IsIn(['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'])
  trustLevel?: TrustLevel;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;
}
