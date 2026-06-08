import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsIn, MaxLength, IsObject } from 'class-validator';
import { DRIVER_ACTION_TYPES } from '@sally/shared-types';

export class CreateDriverActionDto {
  @ApiProperty({ example: 'detention', enum: DRIVER_ACTION_TYPES })
  @IsString()
  @IsIn([...DRIVER_ACTION_TYPES])
  actionType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  stopId?: number;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({
    required: false,
    description: 'Type-specific data (weight, gallons, GPS)',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AcknowledgeDriverActionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResolveDriverActionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  documentId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  loadChargeId?: number;
}
