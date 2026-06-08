import { ApiProperty } from '@nestjs/swagger';
import type { AgentScope } from '@sally/shared-types';

/**
 * Tenant-wide API-key list entry. Never exposes the plaintext key.
 * `keyMasked` is a stable, human-readable substitute so the UI can
 * render a "sk_live_**********" chip.
 */
export class TenantApiKeyListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Masked key display for the UI' })
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
