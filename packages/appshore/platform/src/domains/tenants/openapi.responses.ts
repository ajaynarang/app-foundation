import {
  OrganizationProfileSchema,
  SubdomainAvailabilitySchema,
  TenantAdminDetailsSchema,
  TenantAdminListItemSchema,
  TenantBrandingSchema,
  TenantRecordSchema,
  TenantRegistrationResultSchema,
} from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';
import { defineCursorListSchema } from '../../shared/openapi/common-responses';

export const TenantRecordResponse = defineResponseSchema('TenantRecord', TenantRecordSchema);
export const TenantRegistrationResultResponse = defineResponseSchema(
  'TenantRegistrationResult',
  TenantRegistrationResultSchema,
);
export const SubdomainAvailabilityResponse = defineResponseSchema('SubdomainAvailability', SubdomainAvailabilitySchema);
export const TenantAdminDetailsResponse = defineResponseSchema('TenantAdminDetails', TenantAdminDetailsSchema);
export const TenantAdminListResponseRef = defineCursorListSchema('TenantAdminList', TenantAdminListItemSchema);
export const OrganizationProfileResponse = defineResponseSchema('OrganizationProfile', OrganizationProfileSchema);
export const TenantBrandingResponse = defineResponseSchema('TenantBranding', TenantBrandingSchema);
