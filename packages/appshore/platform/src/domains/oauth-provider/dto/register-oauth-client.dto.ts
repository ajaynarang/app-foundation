import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ProtocolWireDto } from '@appshore/kernel/shared/utils/app-validation-pipe';
import { OAUTH_ERROR } from '../oauth-error.filter';
import { IsHttpsOrLoopbackUrl } from './oauth-client-validators';

const MAX_REDIRECT_URIS = 20;

/**
 * POST /oauth/register — RFC 7591 Dynamic Client Registration request.
 *
 * **camelCase exemption:** the field names are the standard's (snake_case on the wire), because MCP clients send
 * exactly these. Metadata this server does not use (logo_uri, contacts, software_id, …) is dropped, not rejected:
 * RFC 7591 section 2 requires the server to ignore it. A bad value answers 400 with the RFC's `error`
 * (`invalid_redirect_uri` / `invalid_client_metadata`).
 */
@ProtocolWireDto({
  ignoreUnknownFields: true,
  errorCode: (fields) =>
    fields.some((field) => field.startsWith('redirect_uris'))
      ? OAUTH_ERROR.INVALID_REDIRECT_URI
      : OAUTH_ERROR.INVALID_CLIENT_METADATA,
})
export class RegisterOAuthClientDto {
  @ApiProperty({ example: 'Claude', maxLength: 255 })
  @IsString({ message: 'client_name is required' })
  @MinLength(1, { message: 'client_name is required' })
  @MaxLength(255)
  client_name!: string;

  @ApiProperty({ type: [String], example: ['https://claude.ai/api/mcp/auth_callback'] })
  @IsArray({ message: 'redirect_uris must be a non-empty array of strings' })
  @ArrayNotEmpty({ message: 'redirect_uris must be a non-empty array of strings' })
  @ArrayMaxSize(MAX_REDIRECT_URIS)
  @IsHttpsOrLoopbackUrl({ each: true })
  redirect_uris!: string[];

  @ApiPropertyOptional({ description: 'Space-delimited scopes; omitted: the advertised default set' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  scope?: string;

  @ApiPropertyOptional({ type: [String], default: ['authorization_code'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  grant_types?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  response_types?: string[];

  @ApiPropertyOptional({
    default: 'none',
    description: '`none` registers a public client; anything else a confidential one',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  token_endpoint_auth_method?: string;

  @ApiPropertyOptional({ example: 'https://claude.ai' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  client_uri?: string;
}
