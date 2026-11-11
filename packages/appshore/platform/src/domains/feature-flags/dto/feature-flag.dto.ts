import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class FeatureFlagDto {
  @ApiProperty({ example: 'advanced_reports' })
  key: string;

  @ApiProperty({ example: 'Advanced Reports' })
  name: string;

  @ApiProperty({
    example: 'Scheduled and exportable reports',
    required: false,
  })
  description?: string;

  @ApiProperty({ example: false })
  enabled: boolean;

  @ApiProperty({ example: 'reporting' })
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
