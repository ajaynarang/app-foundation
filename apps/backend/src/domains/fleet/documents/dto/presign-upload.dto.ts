import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsIn } from 'class-validator';
import { getAllDocumentTypeCodes } from '@sally/shared-types';
import type { PresignUploadInput } from '@sally/shared-types';

export class PresignUploadDto implements PresignUploadInput {
  @ApiProperty({ example: 'Rate-Confirmation.pdf' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({ example: 245000, description: 'File size in bytes' })
  @IsNumber()
  fileSize: number;

  @ApiProperty({ example: 'load' })
  @IsString()
  @IsIn(['load', 'load_stop', 'driver', 'vehicle', 'recurring_lane'])
  entityType: string;

  @ApiProperty({ example: '42' })
  @IsString()
  @IsNotEmpty()
  entityId: string;

  @ApiProperty({ example: 'rate_confirmation' })
  @IsString()
  @IsIn(getAllDocumentTypeCodes())
  documentType: string;

  @ApiProperty({
    required: false,
    description: 'Related stop ID for BOL/POD',
  })
  @IsString()
  @IsOptional()
  relatedStopId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    required: false,
    description: 'BOL number (auto-saves to LoadStop)',
  })
  @IsString()
  @IsOptional()
  bolNumber?: string;
}
