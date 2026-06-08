import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import type { PlaceSuggestion, PlacesProvider } from '@sally/shared-types';

const PLACES_PROVIDERS = ['here', 'google', 'smarty'] as const;

/**
 * Wire shape of a Places suggestion. Mirrors PlaceSuggestionSchema in
 * @sally/shared-types — class-validator can't consume the Zod schema directly,
 * so the contract is kept in sync by `implements PlaceSuggestion`.
 */
export class PlaceSuggestionDto implements PlaceSuggestion {
  @ApiProperty({ description: 'Provider-scoped external ID for the place' })
  @IsString()
  @IsNotEmpty()
  externalId!: string;

  @ApiProperty({ description: 'Human-readable label for the suggestion' })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ enum: PLACES_PROVIDERS })
  @IsIn(PLACES_PROVIDERS)
  provider!: PlacesProvider;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  street?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  city?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  state?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  zipCode?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  lat?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  lon?: number | null;
}

export class FromPlaceDto {
  @ApiProperty({ type: PlaceSuggestionDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PlaceSuggestionDto)
  suggestion!: PlaceSuggestionDto;

  @ApiProperty({
    required: false,
    description: 'Override the auto-derived Stop name (e.g. dispatcher-typed "Walmart DC #6094")',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  overrideName?: string;
}
