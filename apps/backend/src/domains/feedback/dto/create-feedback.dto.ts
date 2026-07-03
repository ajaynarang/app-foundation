import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeedbackDto {
  @ApiProperty({
    example: 3,
    description: 'Sentiment score 1-5 (1=frustrated, 5=love it)',
  })
  @IsInt()
  @Min(1)
  @Max(5)
  sentiment: number;

  @ApiProperty({ example: 'The map route is not loading properly' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ example: '/projects/route-planning' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  page?: string;
}
