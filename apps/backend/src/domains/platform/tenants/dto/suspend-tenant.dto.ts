import { IsString, MinLength } from 'class-validator';

export class SuspendTenantDto {
  @IsString()
  @MinLength(10, {
    message: 'Suspension reason must be at least 10 characters',
  })
  reason: string;
}
