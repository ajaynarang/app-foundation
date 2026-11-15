import { IsArray, IsString, IsOptional, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookSubscriptionDto {
  @ApiProperty({
    example: 'https://partner.com/hook',
    description:
      'Public HTTPS URL to deliver events to. Private, loopback, link-local and cloud metadata addresses are refused.',
  })
  // The SSRF guard in the service is the one rule for what a webhook URL may be (it also resolves the host).
  @IsString()
  @MaxLength(2048)
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
