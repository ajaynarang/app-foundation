import { IsString, IsNotEmpty, IsNumber, IsPositive, IsInt, MaxLength } from 'class-validator';

export class VoiceRespondDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @IsInt()
  @IsPositive()
  tenantId: number;
}
