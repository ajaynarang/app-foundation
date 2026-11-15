import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class FirebaseExchangeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firebaseToken: string;
}
