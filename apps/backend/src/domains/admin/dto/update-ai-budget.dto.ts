import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateAiBudgetInput } from '@app/shared-types';

/**
 * Budget update payload. Cross-field validation (hard ≥ soft, monthly ≥
 * daily) is enforced by the shared-types Zod schema; class-validator here
 * covers per-field shape + the Swagger contract. The service re-applies
 * the Zod refinements at the boundary.
 */
export class UpdateAiBudgetDto implements UpdateAiBudgetInput {
  @ApiProperty({ example: 5, description: 'Daily soft cap in USD (banner when crossed)' })
  @IsNumber()
  @Min(0)
  dailySoftUsd: number;

  @ApiProperty({ example: 20, description: 'Daily hard cap in USD (blocks when crossed)' })
  @IsNumber()
  @Min(0)
  dailyHardUsd: number;

  @ApiProperty({ example: 50, description: 'Monthly soft cap in USD' })
  @IsNumber()
  @Min(0)
  monthlySoftUsd: number;

  @ApiProperty({ example: 200, description: 'Monthly hard cap in USD' })
  @IsNumber()
  @Min(0)
  monthlyHardUsd: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
