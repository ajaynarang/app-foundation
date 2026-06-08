import { IsString, MinLength, MaxLength } from 'class-validator';

export class NlpSearchDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  query: string;
}
