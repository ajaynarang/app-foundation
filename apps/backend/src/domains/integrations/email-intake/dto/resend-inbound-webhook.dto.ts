import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ResendAttachmentMetaDto {
  @IsString()
  id: string;

  @IsString()
  filename: string;

  @IsString()
  content_type: string;

  @IsOptional()
  @IsString()
  content_disposition?: string;

  @IsOptional()
  @IsString()
  content_id?: string;
}

export class ResendInboundEmailDataDto {
  @IsString()
  email_id: string;

  @IsString()
  from: string;

  @IsArray()
  @IsString({ each: true })
  to: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bcc?: string[];

  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  message_id?: string;

  @IsOptional()
  @IsString()
  created_at?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResendAttachmentMetaDto)
  attachments?: ResendAttachmentMetaDto[];
}

export class ResendInboundWebhookDto {
  @IsString()
  type: string; // "email.received"

  @IsOptional()
  @IsString()
  created_at?: string;

  @ValidateNested()
  @Type(() => ResendInboundEmailDataDto)
  data: ResendInboundEmailDataDto;
}
