import { IsString, IsNumber, IsOptional, IsObject, MaxLength, Min } from 'class-validator';

export class CreateSavedSearchDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsObject()
  searchParams: Record<string, any>;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minRate?: number;
}
