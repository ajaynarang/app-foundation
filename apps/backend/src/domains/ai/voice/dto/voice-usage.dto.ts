import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsPositive, Min, MaxLength, IsUUID } from 'class-validator';

/** End-of-session meter totals the forked voice agent reports once per session. */
export class VoiceUsageDto {
  /** Minted once per agent session; it makes a retried report a no-op. */
  @ApiProperty({ description: 'Minted once per agent session; a retried report with the same id records nothing' })
  @IsUUID()
  sessionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  conversationId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  tenantId: number;

  @ApiProperty({ description: 'The speech-to-text model that ran (a `model_pricing` model for provider `deepgram`)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  sttModel: string;

  @ApiProperty({ description: 'The text-to-speech model that ran (a `model_pricing` model for provider `cartesia`)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  ttsModel: string;

  @ApiProperty({ description: 'Audio sent to speech-to-text, in milliseconds' })
  @IsInt()
  @Min(0)
  sttAudioMs: number;

  @ApiProperty({ description: 'Characters sent to text-to-speech' })
  @IsInt()
  @Min(0)
  ttsCharacters: number;

  @ApiProperty({ description: 'How long the agent session was connected, in milliseconds' })
  @IsInt()
  @Min(0)
  sessionMs: number;
}
