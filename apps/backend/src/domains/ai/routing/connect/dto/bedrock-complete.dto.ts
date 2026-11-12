import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import type { BedrockCompleteInput } from '@app/shared-types';

/** `POST /ai-settings/credentials/bedrock/complete`. Mirrors `BedrockCompleteInputSchema`; no external id is accepted. */
export class BedrockCompleteDto implements BedrockCompleteInput {
  @ApiProperty({
    example: 'arn:aws:iam::123456789012:role/app-bedrock-access',
    description: 'The role created in the workspace AWS account from the begin step',
  })
  @Matches(/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/, { message: 'Must be an IAM role ARN' })
  roleArn!: string;

  @ApiProperty({ example: 'us-east-1', description: 'The AWS region the role calls Bedrock in' })
  @Matches(/^[a-z]{2}(-gov)?-[a-z]+-\d$/, { message: 'Must be an AWS region such as us-east-1' })
  awsRegion!: string;
}
