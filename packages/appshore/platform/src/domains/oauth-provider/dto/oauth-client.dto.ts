import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OAuthScopeSchema, type CreateOAuthClientInput, type UpdateOAuthClientInput } from '@app/shared-types';
import { IsAbsoluteUrl } from './oauth-client-validators';

const OAUTH_CLIENT_TYPES = ['confidential', 'public'] as const;
const NAME_MAX = 255;
const DESCRIPTION_MAX = 1000;

/** POST /oauth/clients — an admin registers a client for their workspace. Mirrors `CreateOAuthClientSchema`. */
export class CreateOAuthClientDto implements Omit<CreateOAuthClientInput, 'clientType'> {
  @ApiProperty({ example: 'Release bot', maxLength: NAME_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name!: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiProperty({ type: [String], example: ['https://bot.example.com/oauth/callback'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsAbsoluteUrl({ each: true })
  redirectUris!: string[];

  @ApiProperty({ enum: OAuthScopeSchema.options, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(OAuthScopeSchema.options, { each: true })
  scopes!: CreateOAuthClientInput['scopes'];

  @ApiPropertyOptional({ enum: OAUTH_CLIENT_TYPES, default: 'confidential' })
  @IsOptional()
  @IsIn(OAUTH_CLIENT_TYPES)
  clientType?: CreateOAuthClientInput['clientType'];
}

/** PUT /oauth/clients/:client_id — every field optional; the same rules as create. */
export class UpdateOAuthClientDto implements UpdateOAuthClientInput {
  @ApiPropertyOptional({ maxLength: NAME_MAX })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsAbsoluteUrl({ each: true })
  redirectUris?: string[];

  @ApiPropertyOptional({ enum: OAuthScopeSchema.options, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(OAuthScopeSchema.options, { each: true })
  scopes?: UpdateOAuthClientInput['scopes'];
}
