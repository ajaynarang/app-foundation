import { IsArray, IsString, IsOptional, IsBoolean, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWebhookSubscriptionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  events?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
