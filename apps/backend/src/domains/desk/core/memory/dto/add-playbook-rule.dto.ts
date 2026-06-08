import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { AddPlaybookRuleRequest, AgentKey } from '@sally/shared-types';

export class AddPlaybookRuleDto implements AddPlaybookRuleRequest {
  @ApiProperty({ description: 'Agent the rule applies to (e.g. sally-billing)' })
  @IsString()
  agentKey!: AgentKey;

  @ApiProperty({ description: 'Free-form rule text the operator typed in the Rules tab', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
