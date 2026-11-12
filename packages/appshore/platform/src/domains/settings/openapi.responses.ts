import { SuperAdminPreferencesSchema, UserPreferencesRecordSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';

export const UserPreferencesRecordResponse = defineResponseSchema('UserPreferencesRecord', UserPreferencesRecordSchema);
export const SuperAdminPreferencesResponse = defineResponseSchema('SuperAdminPreferences', SuperAdminPreferencesSchema);
