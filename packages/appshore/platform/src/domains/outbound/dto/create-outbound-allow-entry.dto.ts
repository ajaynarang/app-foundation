import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OutboundAllowKind } from '@appshore/db';
import type { CreateOutboundAllowEntryInput } from '@app/shared-types';

/** `POST /super-admin/outbound/allow-list` — the value is normalized and checked against its kind in the service. */
export class CreateOutboundAllowEntryDto implements CreateOutboundAllowEntryInput {
  @ApiProperty({ enum: OutboundAllowKind })
  @IsEnum(OutboundAllowKind)
  kind!: OutboundAllowKind;

  @ApiProperty({ example: 'qa@example.com', description: 'An email, an email domain, a phone in E.164 or a host' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  value!: string;

  @ApiPropertyOptional({ example: 'QA inbox' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
