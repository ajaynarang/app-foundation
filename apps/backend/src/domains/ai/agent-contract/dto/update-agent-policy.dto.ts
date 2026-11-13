import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { UpdateAgentPolicyInput } from '@app/shared-types';

/** `PUT /agent-policy`. Mirrors `UpdateAgentPolicyInputSchema`. */
export class UpdateAgentPolicyDto implements UpdateAgentPolicyInput {
  @ApiProperty({
    description:
      'True lets external agents confirm their own standard writes by repeating the call with the token. False ' +
      '(default) makes each one wait for a person to approve it in the app. A sensitive write always needs the PIN.',
  })
  @IsBoolean()
  selfConfirm!: boolean;
}
