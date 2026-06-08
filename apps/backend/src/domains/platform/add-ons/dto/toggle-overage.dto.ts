import { IsBoolean } from 'class-validator';

export class ToggleOverageDto {
  @IsBoolean()
  enabled: boolean;
}
