import { IsDateString, IsArray, IsOptional, IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplayWebhookDto {
  @ApiProperty({ example: '2026-04-01T00:00:00Z' })
  @IsDateString()
  since: string;

  @ApiProperty({ required: false, example: ['sally.load.created'] })
  @IsArray()
  @IsOptional()
  events?: string[];

  @ApiProperty({ required: false, default: 1000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  limit?: number = 1000;
}
