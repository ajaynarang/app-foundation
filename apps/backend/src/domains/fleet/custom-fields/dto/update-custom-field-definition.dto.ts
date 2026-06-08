import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, MaxLength, Min } from 'class-validator';
import type { UpdateCustomFieldDefinitionInput } from '@sally/shared-types';

export class UpdateCustomFieldDefinitionDto implements UpdateCustomFieldDefinitionInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  driverEditable?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  showOnInvoice?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  showOnBol?: boolean;
}
