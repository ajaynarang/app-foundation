import { IsString, IsEmail, IsOptional, IsEnum, Matches, MinLength } from 'class-validator';
import { FleetSize, CarrierType } from '@prisma/client';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomain must contain only lowercase letters, numbers, and hyphens',
  })
  subdomain?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,8}$/, { message: 'DOT number must be 1-8 digits' })
  dotNumber?: string;

  @IsOptional()
  @IsEnum(FleetSize)
  fleetSize?: FleetSize;

  @IsOptional()
  @IsEnum(CarrierType)
  carrierType?: CarrierType;

  @IsOptional()
  @Matches(/^\d{1,8}$/, { message: 'MC number must be 1-8 digits' })
  mcNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerFirstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerLastName?: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;
}
