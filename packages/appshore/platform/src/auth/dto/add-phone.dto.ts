import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class AddPhoneDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be E.164 format' })
  phone: string;
}
