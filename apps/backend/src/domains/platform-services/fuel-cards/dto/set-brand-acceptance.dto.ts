import { IsString, IsNotEmpty, IsArray, MaxLength, ArrayMinSize } from 'class-validator';

export class SetBrandAcceptanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  fuelCardTypeIds!: string[];
}
