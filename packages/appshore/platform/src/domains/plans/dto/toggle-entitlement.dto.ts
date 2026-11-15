import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleEntitlementDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
