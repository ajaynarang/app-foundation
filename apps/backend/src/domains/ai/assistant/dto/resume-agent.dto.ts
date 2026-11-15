import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ResumeAgentDto {
  @ApiProperty()
  @IsBoolean()
  confirmed: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toolCallId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  runId?: string;
}
