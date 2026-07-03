import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'bug', enum: ['bug', 'idea', 'general'] })
  @IsIn(['bug', 'idea', 'general'])
  category: 'bug' | 'idea' | 'general';
}
