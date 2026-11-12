import { NotificationPreferenceOptionsSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../../shared/openapi/api-result';

export const NotificationPreferenceOptionsResponse = defineResponseSchema(
  'NotificationPreferenceOptions',
  NotificationPreferenceOptionsSchema,
);
