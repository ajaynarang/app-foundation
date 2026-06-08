import { IsOptional, IsBoolean, IsString, IsIn } from 'class-validator';

export class UpdateDriverPreferencesDto {
  // Mobile app preferences
  @IsOptional()
  @IsString()
  @IsIn(['google_maps', 'apple_maps', 'waze', 'copilot', 'hammer', 'trucker_path'])
  preferredNavApp?: string;

  @IsOptional()
  @IsString()
  @IsIn(['auto', 'light', 'dark'])
  theme?: string;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}
