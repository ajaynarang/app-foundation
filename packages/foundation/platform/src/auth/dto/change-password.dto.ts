import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description: 'Whether to revoke all other sessions (default: true)',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  revokeOtherSessions?: boolean;
}

export class ChangePasswordResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  sessionsRevoked: number;
}
