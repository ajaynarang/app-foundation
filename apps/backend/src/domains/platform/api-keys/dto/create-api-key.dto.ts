import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsISO8601,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { CreateApiKeyInput, AgentScope } from '@app/shared-types';

const CIDR_REGEX = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;

export class CreateApiKeyDto implements CreateApiKeyInput {
  @ApiProperty({ example: 'Production BI Script' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: ['fleet:read', 'invoices:read'],
    description: 'Normalized agent scopes granted to this key',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  scopes: AgentScope[];

  @ApiProperty({
    example: ['10.0.0.1', '10.0.0.0/24'],
    required: false,
    description: 'Optional IPv4/CIDR list. When set, enforced strictly; when empty, key works from any IP.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(CIDR_REGEX, { each: true })
  ipAllowlist: string[] = [];

  @ApiProperty({
    example: 300,
    required: false,
    description: 'Per-minute request cap (default 300)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6000)
  rateLimitPerMinute?: number;

  @ApiProperty({ required: false, description: 'ISO 8601 expiry timestamp' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
