import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, IsBoolean } from 'class-validator';
import type { CreateContact } from '@sally/shared-types';

export class CreateContactDto implements CreateContact {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'PRIMARY' })
  @IsEnum(['PRIMARY', 'OPERATIONS', 'BILLING', 'CLAIMS', 'AFTER_HOURS', 'OTHER'], { message: 'Invalid contact role' })
  @IsNotEmpty()
  role: 'PRIMARY' | 'OPERATIONS' | 'BILLING' | 'CLAIMS' | 'AFTER_HOURS' | 'OTHER';

  @ApiProperty({ example: 'jane@acme.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '(555) 123-4567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'VP of Operations', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'Prefers email over phone', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
