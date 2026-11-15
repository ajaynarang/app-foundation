import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsIn } from 'class-validator';
import type { UserMode } from '../../agents/agent.types';

export class CreateConversationDto {
  @ApiProperty({ enum: ['owner', 'admin', 'member', 'super_admin'] })
  @IsNotEmpty()
  @IsIn(['owner', 'admin', 'member', 'super_admin'])
  userMode: UserMode;
}
