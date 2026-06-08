import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  MaxLength,
  ArrayMinSize,
  ValidateIf,
} from 'class-validator';
import type { CreateCustomFieldDefinitionInput } from '@sally/shared-types';

export class CreateCustomFieldDefinitionDto implements CreateCustomFieldDefinitionInput {
  @ApiProperty({
    example: 'LOAD',
    enum: ['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER'],
  })
  @IsEnum(['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER'], {
    message: 'entityType must be LOAD, DRIVER, VEHICLE, or CUSTOMER',
  })
  entityType: 'LOAD' | 'DRIVER' | 'VEHICLE' | 'CUSTOMER';

  @ApiProperty({
    example: 'Seal Number',
    description: 'Display label for the field',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'TEXT',
    enum: ['TEXT', 'NUMBER', 'DATE', 'SELECT'],
  })
  @IsEnum(['TEXT', 'NUMBER', 'DATE', 'SELECT'], {
    message: 'fieldType must be TEXT, NUMBER, DATE, or SELECT',
  })
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';

  @ApiProperty({ example: ['East', 'West', 'Central'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ValidateIf((o) => o.fieldType === 'SELECT')
  @ArrayMinSize(1, { message: 'SELECT fields must have at least one option' })
  options: string[] = [];

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isRequired: boolean = false;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  driverEditable: boolean = false;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  showOnInvoice: boolean = false;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  showOnBol: boolean = false;
}
