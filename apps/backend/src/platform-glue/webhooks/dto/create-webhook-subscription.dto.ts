import { IsUrl, IsArray, IsString, IsOptional, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookSubscriptionDto {
  @ApiProperty({
    example: 'https://partner.com/hook',
    description: 'HTTPS URL to deliver events to',
  })
  @IsUrl({ protocols: ['https'], require_tld: true, require_protocol: true })
  url: string;

  @ApiProperty({
    example: ['app.load.created'],
    description: 'Event names to subscribe to. Use ["*"] for all events.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  events: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
