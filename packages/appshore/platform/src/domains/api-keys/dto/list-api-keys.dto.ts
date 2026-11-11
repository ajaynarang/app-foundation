import { ApiProperty } from '@nestjs/swagger';
import type { AgentScope } from '@app/shared-types';

/**
 * Tenant-wide API-key list entry. The plaintext key is not stored;
 * `keyMasked` is the prefix and last four characters ("sk_live_…AbCd")
 * so a user can tell their keys apart.
 */
export class TenantApiKeyListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'sk_live_…AbCd', description: 'Prefix and last four characters, for display' })
  keyMasked: string;

  @ApiProperty()
  userId: number;

  @ApiProperty({ type: [String] })
  scopes: AgentScope[];

  @ApiProperty({ type: [String] })
  ipAllowlist: string[];

  @ApiProperty()
  rateLimitPerMinute: number;

  @ApiProperty()
  isWriteEnabled: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ nullable: true })
  lastUsedAt: string | null;

  @ApiProperty()
  requestCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ nullable: true })
  expiresAt: string | null;

  @ApiProperty({ nullable: true })
  revokedAt: string | null;
}
