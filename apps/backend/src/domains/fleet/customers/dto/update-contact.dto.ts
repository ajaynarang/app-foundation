import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsEnum, IsBoolean } from 'class-validator';
import type { UpdateContact } from '@sally/shared-types';

export class UpdateContactDto implements UpdateContact {
  @ApiProperty({ example: 'Jane', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Smith', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ example: 'BILLING', required: false })
  @IsOptional()
  @IsEnum(['PRIMARY', 'OPERATIONS', 'BILLING', 'CLAIMS', 'AFTER_HOURS', 'OTHER'], { message: 'Invalid contact role' })
  role?: 'PRIMARY' | 'OPERATIONS' | 'BILLING' | 'CLAIMS' | 'AFTER_HOURS' | 'OTHER';

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
