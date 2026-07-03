import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveFeedbackDto {
  @ApiProperty({
    example: 'Called user, confirmed known issue. Fix scheduled for next sprint.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note: string;
}
