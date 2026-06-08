import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateResponsibilityAutonomyRequest } from '../../types';

/**
 * PATCH /desk/responsibilities/:key/autonomy — flips the per-responsibility
 * "Run automatically" switch. Single-field on purpose: turning a
 * responsibility loose on its own (any non-manual trigger) is an explicit
 * action, not folded into the general settings PATCH. Manual "Run now" is
 * never gated by this flag.
 */
export class UpdateResponsibilityAutonomyDto implements UpdateResponsibilityAutonomyRequest {
  @ApiProperty({
    description:
      'When true, the responsibility may run on its own (scheduled today; domain-event / webhook in the future) — provided the tenant master switch is on',
  })
  @IsBoolean()
  autonomyEnabled: boolean;
}
