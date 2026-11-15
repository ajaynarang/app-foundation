import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ResumeAgentDto {
  @ApiProperty({ description: 'Confirm (true) or Cancel (false) on the card' })
  @IsBoolean()
  confirmed: boolean;

  @ApiPropertyOptional({
    description: "The card's `toolCallId` from the `9:` frame. Required to confirm; a Cancel with it voids that card.",
  })
  @IsOptional()
  @IsString()
  toolCallId?: string;

  @ApiPropertyOptional({ description: 'The suspended run id from the `9:` frame' })
  @IsOptional()
  @IsString()
  runId?: string;
}
