import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeactivateVehicleDto {
  @IsString()
  @IsNotEmpty({ message: 'Deactivation reason is required' })
  @MaxLength(500)
  reason: string;
}
