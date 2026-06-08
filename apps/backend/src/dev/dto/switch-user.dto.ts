import { IsString, IsNotEmpty } from 'class-validator';

export class SwitchUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
