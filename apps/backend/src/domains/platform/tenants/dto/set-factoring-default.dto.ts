import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import type { SetTenantFactoringDefaultInput } from '@app/shared-types';

/**
 * Body for `PATCH /api/v1/tenants/me/factoring-default`. Pass `null` to unpin.
 * The numeric id is the Prisma `factoring_companies.id` for the tenant's row.
 */
export class SetFactoringDefaultDto implements SetTenantFactoringDefaultInput {
  @ApiProperty({
    description: 'Factoring company DB id (Prisma int) — pass null to unpin',
    nullable: true,
    example: 42,
  })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  factoringCompanyId: number | null;
}
