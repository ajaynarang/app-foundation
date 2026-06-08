import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DeclineRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
