import { ApiProperty } from '@nestjs/swagger';
import type { ApiKeyResponse, AgentScope } from '@app/shared-types';

export class ApiKeyDto implements ApiKeyResponse {
  @ApiProperty()
  id: number;

  @ApiProperty({ required: false, description: 'Only returned on creation' })
  key?: string;

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
