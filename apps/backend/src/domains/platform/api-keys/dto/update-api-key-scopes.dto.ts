import { IsArray, IsString, ArrayNotEmpty, ArrayMaxSize, IsOptional, IsInt, Min, Max, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { AgentScope } from '@sally/shared-types';

const CIDR_REGEX = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;

/**
 * Payload for PATCH /api-keys/:id/scopes. Tenant admins edit the scope
 * set, IP allowlist, and rate-limit on an existing key. Issuing a new
 * plaintext key requires the rotate endpoint — this endpoint never
 * exposes the secret.
 */
export class UpdateApiKeyScopesDto {
  @ApiProperty({
    type: [String],
    example: ['fleet:read', 'loads:write'],
    description: 'New scope set (replaces the existing list)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  scopes: AgentScope[];

  @ApiProperty({
    type: [String],
    required: false,
    example: ['10.0.0.0/24'],
    description: 'Optional IPv4/CIDR allowlist. Required at the service layer if scopes include a write-tier scope.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(CIDR_REGEX, { each: true })
  ipAllowlist?: string[];

  @ApiProperty({ required: false, example: 300 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6000)
  rateLimitPerMinute?: number;
}
