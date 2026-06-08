import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ResumeAgentDto {
  @IsBoolean()
  confirmed: boolean;

  @IsOptional()
  @IsString()
  toolCallId?: string;

  @IsOptional()
  @IsString()
  runId?: string;
}
