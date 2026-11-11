import { ApiProperty } from '@nestjs/swagger';
import type { ApiKeyResponse, AgentScope } from '@app/shared-types';

export class ApiKeyDto implements ApiKeyResponse {
  @ApiProperty()
  id: number;

  @ApiProperty({
    required: false,
    description: 'The full key. Returned once, when the key is created; it is not stored.',
  })
  key?: string;

  @ApiProperty({ example: 'sk_live_…AbCd', description: 'Prefix and last four characters, for display' })
  keyMasked: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  scopes: AgentScope[];

  @ApiProperty({ type: [String] })
  ipAllowlist: string[];

  @ApiProperty()
  rateLimitPerMinute: number;

  @ApiProperty()
  isWriteEnabled: boolean;

  @ApiProperty()
  requestCount: number;

  @ApiProperty({ nullable: true })
  lastUsedAt: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ nullable: true })
  expiresAt: string | null;
}
