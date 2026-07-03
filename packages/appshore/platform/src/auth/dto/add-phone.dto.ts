import { IsString, Matches } from 'class-validator';

export class AddPhoneDto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be E.164 format' })
  phone: string;
}
