import {
  PlanConfigRecordSchema,
  PlanConfigWithEntitlementsSchema,
  PlanEntitlementRecordSchema,
  TenantPlanSnapshotSchema,
} from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';

export const TenantPlanSnapshotResponse = defineResponseSchema('TenantPlanSnapshot', TenantPlanSnapshotSchema);
export const PlanConfigRecordResponse = defineResponseSchema('PlanConfigRecord', PlanConfigRecordSchema);
export const PlanConfigWithEntitlementsResponse = defineResponseSchema(
  'PlanConfigWithEntitlements',
  PlanConfigWithEntitlementsSchema,
);
export const PlanEntitlementRecordResponse = defineResponseSchema('PlanEntitlementRecord', PlanEntitlementRecordSchema);
