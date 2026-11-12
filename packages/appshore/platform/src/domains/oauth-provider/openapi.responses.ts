import { OAuthErrorSchema, OAuthTokenIssuedSchema } from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';

/** RFC 6749 section 5.1: the token endpoint's answer. */
export const OAuthTokenIssuedResponse = defineResponseSchema('OAuthTokenIssued', OAuthTokenIssuedSchema);
/** RFC 6749 section 5.2: what every OAuth protocol endpoint answers on error (`OAuthErrorFilter`), not the envelope. */
export const OAuthErrorResponse = defineResponseSchema('OAuthError', OAuthErrorSchema);
