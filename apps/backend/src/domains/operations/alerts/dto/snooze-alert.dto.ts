import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class SnoozeAlertDto {
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @IsOptional()
  @IsString()
  note?: string;
}
