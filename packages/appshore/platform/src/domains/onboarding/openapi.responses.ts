import { OnboardingStatusResponseSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';

export const OnboardingStatusResult = defineResponseSchema('OnboardingStatus', OnboardingStatusResponseSchema);
