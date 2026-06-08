import { IsBoolean, IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * PATCH /desk/agents/:key — update a single agent's tenant-editable state.
 *
 * `enabled` bulk-toggles every AVAILABLE responsibility (panic-stop shortcut).
 * `supervisorUserId` rebinds the agent's supervisor (OWNER/ADMIN-only —
 * enforced in the controller method).
 */
export class UpdateAgentDto {
  @ApiProperty({
    required: false,
    description: 'When present, toggles every AVAILABLE responsibility to this value',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Rebind supervisor. null clears. OWNER/ADMIN only.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  supervisorUserId?: number | null;
}
