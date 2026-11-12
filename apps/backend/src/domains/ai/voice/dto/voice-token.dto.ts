import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VoiceTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}
