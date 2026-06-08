import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMemoryDto {
  @ApiProperty({ required: false, description: 'Edited lesson text' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content?: string;

  @ApiProperty({ required: false, description: 'Soft-delete flag' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
