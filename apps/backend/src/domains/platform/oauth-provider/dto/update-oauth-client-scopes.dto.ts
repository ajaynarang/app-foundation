import { IsArray, IsString, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { AgentScope } from '@app/shared-types';

/**
 * Payload for PATCH /oauth/clients/:client_id/scopes.
 * Replaces the grantable scope set on an OAuth client. OAuth clients
 * don't carry ipAllowlist or rateLimitPerMinute — those come from the
 * `oauth_client` principal-kind defaults in the Agent Contract config.
 */
export class UpdateOAuthClientScopesDto {
  @ApiProperty({
    type: [String],
    example: ['fleet:read', 'loads:read'],
    description: 'New scope set (replaces the existing list)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  scopes: AgentScope[];
}
