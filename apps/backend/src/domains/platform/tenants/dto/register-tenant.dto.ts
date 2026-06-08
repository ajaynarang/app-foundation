import { IsString, IsEmail, IsNotEmpty, IsOptional, IsEnum, Matches, ValidateIf } from 'class-validator';
import { FleetSize, CarrierType } from '@prisma/client';

export class RegisterTenantDto {
  // Company information
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomain must contain only lowercase letters, numbers, and hyphens',
  })
  subdomain: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{1,8}$/, { message: 'DOT number must be 1-8 digits' })
  dotNumber: string;

  @IsEnum(CarrierType)
  carrierType: CarrierType;

  @ValidateIf((o) => o.carrierType === 'FOR_HIRE_INTERSTATE' || !!o.mcNumber)
  @IsString()
  @IsNotEmpty({
    message: 'MC number is required for For-Hire Interstate carriers',
  })
  @Matches(/^\d{1,8}$/, { message: 'MC number must be 1-8 digits' })
  mcNumber?: string;

  @IsEnum(FleetSize)
  fleetSize: FleetSize;

  // Admin user information
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  firebaseUid: string;

  // Contact information
  @IsString()
  @IsNotEmpty()
  phone: string;

  // Bot protection
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
