import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SuspendTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(10, {
    message: 'Suspension reason must be at least 10 characters',
  })
  reason: string;
}
