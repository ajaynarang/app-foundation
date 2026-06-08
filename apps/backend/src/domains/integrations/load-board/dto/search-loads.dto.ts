import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max, Length } from 'class-validator';

class LocationDto {
  @IsString()
  city: string;

  @IsString()
  @Length(2, 2)
  state: string;

  @IsNumber()
  @Min(10)
  @Max(500)
  @IsOptional()
  radius: number = 50;
}

export class SearchLoadsDto {
  @ValidateNested()
  @Type(() => LocationDto)
  origin: LocationDto;

  @ValidateNested()
  @Type(() => LocationDto)
  @IsOptional()
  destination?: LocationDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  equipmentType?: string[];

  @IsNumber()
  @IsOptional()
  minRate?: number;

  @IsNumber()
  @IsOptional()
  maxDeadhead?: number;

  @IsNumber()
  @IsOptional()
  minWeight?: number;

  @IsNumber()
  @IsOptional()
  maxWeight?: number;

  @IsString()
  @IsOptional()
  pickupDateFrom?: string;

  @IsString()
  @IsOptional()
  pickupDateTo?: string;

  @IsString()
  @IsOptional()
  provider: string = 'dat';

  @IsNumber()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 25;
}
