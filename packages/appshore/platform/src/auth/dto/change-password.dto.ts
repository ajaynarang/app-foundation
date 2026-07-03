import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiPropertyOptional({ description: 'Current password (required to set a new one on password accounts)' })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiPropertyOptional({ description: 'New password (min 8 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;

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
