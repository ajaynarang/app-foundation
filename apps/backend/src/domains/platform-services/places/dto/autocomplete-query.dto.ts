import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { AutocompleteQuery } from '@sally/shared-types';

const ALLOWED_COUNTRIES = ['US'] as const;

export class AutocompleteQueryDto implements AutocompleteQuery {
  @ApiProperty({
    example: 'walmart',
    description: 'Free-text query (3–120 chars after trim)',
    minLength: 3,
    maxLength: 120,
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(3)
  @MaxLength(120)
  q!: string;

  @ApiProperty({ enum: ALLOWED_COUNTRIES, required: false, default: 'US' })
  @IsOptional()
  @IsIn(ALLOWED_COUNTRIES as readonly string[])
  country?: 'US';

  @ApiProperty({ required: false, description: 'HERE session token for billing optimization', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sessionToken?: string;

  @ApiProperty({ required: false, default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
