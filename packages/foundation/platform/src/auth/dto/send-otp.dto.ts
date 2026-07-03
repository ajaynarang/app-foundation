import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone must be E.164 format (e.g. +12025551234)',
  })
  phone: string;
}
