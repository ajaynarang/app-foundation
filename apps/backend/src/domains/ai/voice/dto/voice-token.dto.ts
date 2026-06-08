import { IsString, IsNotEmpty } from 'class-validator';

export class VoiceTokenDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}
