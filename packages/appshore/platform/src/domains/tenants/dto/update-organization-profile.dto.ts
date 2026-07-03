import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { UpdateOrganizationProfileInput } from '@app/shared-types';

import { IsIanaTimezone } from '@appshore/kernel/shared/validators/is-iana-timezone.validator';

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

  @ApiPropertyOptional({ example: 'America/Chicago', description: 'IANA timezone identifier' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;
}
