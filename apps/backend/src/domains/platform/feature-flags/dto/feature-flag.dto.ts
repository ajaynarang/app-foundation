import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class FeatureFlagDto {
  @ApiProperty({ example: 'route_planning' })
  key: string;

  @ApiProperty({ example: 'Route Planning' })
  name: string;

  @ApiProperty({
    example: 'Intelligent route planning with HOS compliance',
    required: false,
  })
  description?: string;

  @ApiProperty({ example: false })
  enabled: boolean;

  @ApiProperty({ example: 'dispatcher' })
  category: string;
}

export class FeatureFlagsResponse {
  @ApiProperty({ type: [FeatureFlagDto] })
  flags: FeatureFlagDto[];
}

export class UpdateFeatureFlagDto {
  @ApiProperty({ example: true, description: 'Enable or disable the feature' })
  @IsBoolean()
  enabled: boolean;
}
