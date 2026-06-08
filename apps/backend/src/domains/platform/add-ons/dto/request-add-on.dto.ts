import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestAddOnDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
