import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmStopDto {
  @IsString()
  stopId: string;

  @IsInt()
  sequenceOrder: number;

  @IsString()
  actionType: string;

  @IsOptional()
  @IsString()
  appointmentDate?: string;

  @IsOptional()
  @IsString()
  earliestArrival?: string;

  @IsOptional()
  @IsNumber()
  estimatedDockHours?: number;

  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  zipCode: string;
}

export class ConfirmEmailLoadDto {
  @IsInt()
  attachmentId: number;

  @IsOptional()
  @IsNumber()
  customerId?: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsNumber()
  rateCents?: number;

  @IsOptional()
  @IsNumber()
  weightLbs?: number;

  @IsOptional()
  @IsString()
  commodityType?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmStopDto)
  stops?: ConfirmStopDto[];
}
