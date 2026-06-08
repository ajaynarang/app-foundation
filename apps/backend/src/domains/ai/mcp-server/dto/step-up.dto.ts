import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StepUpDto {
  @ApiProperty({
    example: '1234',
    description: '4-digit dispatcher PIN used to confirm sensitive HITL actions',
  })
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}
