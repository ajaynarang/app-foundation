import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { BundleFormatSchema, type SetTenantBundleFormatInput } from '@app/shared-types';

const BUNDLE_FORMATS = BundleFormatSchema.options;

/**
 * Body for `PATCH /api/v1/tenants/me/bundle-format`. Sets the tenant-level
 * factor bundle format. ZIP is the default; MERGED_PDF is opt-in.
 */
export class SetBundleFormatDto implements SetTenantBundleFormatInput {
  @ApiProperty({ enum: BUNDLE_FORMATS, description: 'Bundle format for factor email attachments' })
  @IsString()
  @IsIn(BUNDLE_FORMATS)
  format: (typeof BUNDLE_FORMATS)[number];
}
