import { IsArray, IsString, IsDateString, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type {
  BatchCalculateInput,
  BatchSettlementActionInput,
  PreviewBatchInput,
  UpdateNotesInput,
} from '@sally/shared-types';

export class BatchCalculateDto implements BatchCalculateInput {
  @ApiProperty({
    example: ['DRV-001', 'DRV-002'],
    description: 'Driver IDs to calculate settlements for (max 50)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  driverIds: string[];

  @ApiProperty({ example: '2026-02-24' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-03-02' })
  @IsDateString()
  periodEnd: string;
}

export class BatchSettlementActionDto implements BatchSettlementActionInput {
  @ApiProperty({
    example: ['stl_abc123', 'stl_def456'],
    description: 'Settlement IDs to act on (max 50)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  settlementIds: string[];
}

export class PreviewBatchDto implements PreviewBatchInput {
  @ApiProperty({ example: '2026-02-24' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-03-02' })
  @IsDateString()
  periodEnd: string;
}

export class UpdateNotesDto implements UpdateNotesInput {
  @ApiProperty({ example: 'Internal memo about this settlement' })
  @IsString()
  notes: string;
}
