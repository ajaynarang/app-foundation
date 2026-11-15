import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { ConnectKeyInput, PasteKeyCredentialType } from '@app/shared-types';
import { PASTE_KEY_TYPES } from '../../route-registry';

/** `POST /ai-settings/credentials`. Mirrors `ConnectKeyInputSchema`. */
export class ConnectKeyDto implements ConnectKeyInput {
  @ApiProperty({ enum: PASTE_KEY_TYPES, description: 'The provider. An AWS role is not connected by pasting a key.' })
  @IsIn(PASTE_KEY_TYPES)
  type!: PasteKeyCredentialType;

  @ApiProperty({
    writeOnly: true,
    minLength: 8,
    maxLength: 4096,
    description: 'The provider API key. Tested, then stored encrypted; it is never returned or readable again.',
  })
  @IsString()
  @Length(8, 4096)
  secret!: string;

  @ApiProperty({
    required: false,
    description:
      'An Anthropic key only: the owner attests the organisation has a zero-retention agreement with Anthropic.',
  })
  @IsOptional()
  @IsBoolean()
  zdrAttested?: boolean;
}
