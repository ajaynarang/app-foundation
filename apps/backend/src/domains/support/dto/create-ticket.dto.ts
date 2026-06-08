import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength, IsInt, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class RelatedEntityDto {
  @IsString()
  type: string;

  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateTicketDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    enum: ['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL'],
  })
  @IsOptional()
  @IsEnum(['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'INTEGRATION', 'GENERAL'] as const)
  category?: string;

  @ApiPropertyOptional({ enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] })
  @IsOptional()
  @IsEnum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)
  priority?: string;

  @ApiPropertyOptional({ description: 'Link to an AI assistant conversation' })
  @IsOptional()
  @IsInt()
  conversationId?: number;

  @ApiPropertyOptional({
    description: 'Related entities from AI context',
    type: [RelatedEntityDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedEntityDto)
  relatedEntities?: RelatedEntityDto[];
}
