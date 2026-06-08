import { IsString, IsEmail, IsOptional, IsEnum, Matches, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FleetSize, CarrierType } from '@prisma/client';
import type { UpdateOrganizationProfileInput } from '@app/shared-types';

import { IsIanaTimezone } from '../../../../shared/validators/is-iana-timezone.validator';

/**
 * Self-service company-profile edit (OWNER/ADMIN) via `PATCH /tenants/me`.
 *
 * Distinct from the super-admin `UpdateTenantDto` on purpose: this DTO only
 * carries the editable profile fields and writes the TENANT contact directly —
 * it never touches the owner User login or any lifecycle/billing field
 * (subdomain, plan, status).
 */
export class UpdateOrganizationProfileDto implements UpdateOrganizationProfileInput {
  @ApiPropertyOptional({ example: 'Acme Logistics LLC' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;

  @ApiPropertyOptional({ example: 'ops@acmelogistics.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+15125550123' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: '1234567', description: 'DOT number, 1-8 digits' })
  @IsOptional()
  @Matches(/^\d{1,8}$/, { message: 'DOT number must be 1-8 digits' })
  dotNumber?: string;

  @ApiPropertyOptional({ example: '987654', description: 'MC number, 1-8 digits' })
  @IsOptional()
  @Matches(/^\d{1,8}$/, { message: 'MC number must be 1-8 digits' })
  mcNumber?: string;

  @ApiPropertyOptional({ enum: CarrierType })
  @IsOptional()
  @IsEnum(CarrierType)
  carrierType?: CarrierType;

  @ApiPropertyOptional({ enum: FleetSize })
  @IsOptional()
  @IsEnum(FleetSize)
  fleetSize?: FleetSize;

  @ApiPropertyOptional({ example: 'America/Chicago', description: 'IANA timezone identifier' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;
}
