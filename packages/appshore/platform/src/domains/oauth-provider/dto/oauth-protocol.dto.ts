import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProtocolWireDto } from '@appshore/kernel/shared/utils/app-validation-pipe';
import { OAUTH_ERROR } from '../oauth-error.filter';

/**
 * The OAuth 2.1 protocol bodies (RFC 6749 / 7636 / 7009).
 *
 * **camelCase exemption:** field names are the standards' (snake_case on the wire): every OAuth client sends
 * exactly these. Parameters a client may add that this server does not use are dropped, not rejected
 * (RFC 6749 section 3.1: "The authorization server MUST ignore unrecognized request parameters"). A value of the
 * wrong shape (a repeated key, an over-long string) answers 400 `invalid_request`. Which parameters are REQUIRED
 * depends on `grant_type`, so the controller checks presence and answers with the RFC's error codes.
 */
const MAX_PARAM = 2048;

/** An optional protocol parameter: one string (a repeated key is refused as such), at most {@link MAX_PARAM}. */
function WireParam(): PropertyDecorator {
  // Applied in order, so the "one string" check runs, and is reported, before the length check.
  return applyDecorators(IsOptional(), IsString(), MaxLength(MAX_PARAM));
}

/** POST /oauth/authorize/consent — the signed-in user approves a consent challenge (our JWT route, camelCase). */
export class ApproveOAuthConsentDto {
  @ApiProperty({ description: 'The challenge token from /oauth/authorize' })
  // The check declared last is reported first: a missing token reads "Missing challenge token", not a length rule.
  @MaxLength(MAX_PARAM)
  @IsNotEmpty({ message: 'Missing challenge token' })
  @IsString({ message: 'Missing challenge token' })
  challenge!: string;

  @ApiPropertyOptional({ type: [String], description: 'The scopes the user keeps (omitted: all requested)' })
  @IsOptional()
  @IsArray({ message: 'selectedScopes must be an array of strings when provided' })
  @ArrayMaxSize(100)
  @IsString({ each: true, message: 'selectedScopes must be an array of strings when provided' })
  selectedScopes?: string[];
}

/** POST /oauth/token — RFC 6749 section 4.1.3 (authorization_code + PKCE) and section 6 (refresh_token). */
@ProtocolWireDto({ ignoreUnknownFields: true, errorCode: OAUTH_ERROR.INVALID_REQUEST })
export class OAuthTokenRequestDto {
  @ApiProperty({ enum: ['authorization_code', 'refresh_token'] })
  @WireParam()
  grant_type?: string;

  @ApiPropertyOptional()
  @WireParam()
  code?: string;

  @ApiPropertyOptional()
  @WireParam()
  redirect_uri?: string;

  @ApiPropertyOptional()
  @WireParam()
  client_id?: string;

  @ApiPropertyOptional()
  @WireParam()
  client_secret?: string;

  @ApiPropertyOptional()
  @WireParam()
  code_verifier?: string;

  @ApiPropertyOptional()
  @WireParam()
  refresh_token?: string;
}

/** POST /oauth/revoke — RFC 7009 section 2.1. */
@ProtocolWireDto({ ignoreUnknownFields: true, errorCode: OAUTH_ERROR.INVALID_REQUEST })
export class OAuthRevokeRequestDto {
  @ApiProperty()
  @WireParam()
  token?: string;

  @ApiPropertyOptional({ enum: ['access_token', 'refresh_token'] })
  @WireParam()
  token_type_hint?: string;
}
