import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFilingStatusDto {
  @ApiProperty({
    description: 'Target filing status',
    enum: ['DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED'],
  })
  @IsIn(['DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED'])
  status: string;

  @ApiProperty({
    description: 'IFTA filing confirmation number',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  confirmationNumber?: string;

  @ApiProperty({ description: 'How the filing was submitted', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  filingMethod?: string;

  @ApiProperty({ description: 'Notes about the filing', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
