import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitFeedbackDto {
  @ApiProperty({
    enum: ['good', 'bad'],
    description: 'Rating for the decision',
  })
  @IsString()
  @IsIn(['good', 'bad'])
  rating: 'good' | 'bad';

  @ApiProperty({
    required: false,
    description: 'Optional reason for the rating (especially for bad ratings)',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
