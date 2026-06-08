import { IsBoolean } from 'class-validator';

export class ToggleEntitlementDto {
  @IsBoolean()
  enabled: boolean;
}
