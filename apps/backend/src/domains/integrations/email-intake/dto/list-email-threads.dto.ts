import { IsOptional, IsString, IsNumber, IsIn, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListEmailThreadsDto {
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'CONFIRMED', 'DISCARDED', 'ARCHIVED'])
  status?: string;

  @IsOptional()
  @IsString()
  senderEmail?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
