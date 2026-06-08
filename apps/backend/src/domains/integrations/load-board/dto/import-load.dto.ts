import { IsString } from 'class-validator';

export class ImportLoadDto {
  @IsString()
  externalId: string;

  @IsString()
  provider: string = 'dat';
}
