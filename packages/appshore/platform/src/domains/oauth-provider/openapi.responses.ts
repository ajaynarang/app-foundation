import {
  OAuthClientCreatedResponseSchema,
  OAuthClientResponseSchema,
  OAuthClientSecretRotatedSchema,
  OAuthConsentApprovedSchema,
  OAuthErrorSchema,
  OAuthTokenIssuedSchema,
} from '@app/shared-types';
import { defineResponseSchema } from '../../shared/openapi/api-result';
import { defineCursorListSchema } from '../../shared/openapi/common-responses';

/** An OAuth client as the admin routes see it, never the secret. */
export const OAuthClientResponse = defineResponseSchema('OAuthClient', OAuthClientResponseSchema);
export const OAuthClientListResponse = defineCursorListSchema('OAuthClientList', OAuthClientResponseSchema);
/** The new client plus its plaintext secret: the only time the secret is shown. */
export const OAuthClientCreatedResponse = defineResponseSchema('OAuthClientCreated', OAuthClientCreatedResponseSchema);
export const OAuthClientSecretRotatedResponse = defineResponseSchema(
  'OAuthClientSecretRotated',
  OAuthClientSecretRotatedSchema,
);
export const OAuthConsentApprovedResponse = defineResponseSchema('OAuthConsentApproved', OAuthConsentApprovedSchema);
/** RFC 6749 section 5.1: the token endpoint's answer. */
export const OAuthTokenIssuedResponse = defineResponseSchema('OAuthTokenIssued', OAuthTokenIssuedSchema);
/** RFC 6749 section 5.2: what every OAuth protocol endpoint answers on error (`OAuthErrorFilter`), not the envelope. */
export const OAuthErrorResponse = defineResponseSchema('OAuthError', OAuthErrorSchema);
