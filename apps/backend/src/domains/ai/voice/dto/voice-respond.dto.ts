import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsPositive, IsInt, MaxLength } from 'class-validator';

export class VoiceRespondDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty()
  @IsNumber()
  @IsInt()
  @IsPositive()
  tenantId: number;
}
