import { WhatsAppConsentSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../../../shared/openapi/api-result';

export const WhatsAppConsentResponse = defineResponseSchema('WhatsAppConsent', WhatsAppConsentSchema);
